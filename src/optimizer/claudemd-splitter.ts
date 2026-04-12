import * as fs from 'fs';
import * as path from 'path';
import { countTokens } from '../analyzer/tokenizer.js';
import { backupFile } from '../shared/backup-manager.js';

export interface ParsedSection {
  title: string; // empty string = preamble (content before first ## heading)
  content: string; // full raw text of this section including the ## header line
  tokens: number;
  isPreamble: boolean;
}

export interface ExtractedFile {
  filePath: string;
  content: string;
  sectionTitle: string;
  refPath: string; // relative path used in @reference (e.g. ".claude/commands.md")
}

export interface SplitResult {
  claudeMdPath: string;
  newClaudeMd: string;
  extractedFiles: ExtractedFile[];
  tokensSaved: number;
}

/** Minimum token count for a section to be worth extracting */
export const SPLIT_MIN_TOKENS = 300;

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parse a CLAUDE.md file into preamble + `##`-level sections.
 * `#` top-level headings are included in the preamble or kept with their section.
 */
export function parseSections(content: string): ParsedSection[] {
  const lines = content.split('\n');
  const sections: ParsedSection[] = [];

  let currentLines: string[] = [];
  let currentTitle = '';
  let isPreamble = true;

  const flush = () => {
    if (currentLines.length === 0 && !isPreamble) return;
    const text = currentLines.join('\n');
    sections.push({
      title: currentTitle,
      content: text,
      tokens: countTokens(text),
      isPreamble,
    });
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      currentTitle = line.slice(3).trim();
      currentLines = [line];
      isPreamble = false;
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

/**
 * Plan the split: choose which sections to extract, build the new CLAUDE.md text
 * and the list of files to create. Does NOT write anything to disk.
 */
export function planSplit(claudeMdPath: string, sectionsToExtract: string[]): SplitResult {
  const content = fs.readFileSync(claudeMdPath, 'utf-8');
  const sections = parseSections(content);
  const claudeDir = path.join(path.dirname(claudeMdPath), '.claude');

  const extractedFiles: ExtractedFile[] = [];
  let newContent = '';
  let tokensSaved = 0;

  // Track slugs to avoid duplicate filenames
  const usedSlugs = new Map<string, number>();

  for (const section of sections) {
    if (!section.isPreamble && sectionsToExtract.includes(section.title)) {
      let slug = slugify(section.title);
      const count = usedSlugs.get(slug) ?? 0;
      if (count > 0) slug = `${slug}-${count}`;
      usedSlugs.set(slug, count + 1);

      const filename = `${slug}.md`;
      const relRefPath = `.claude/${filename}`;
      const filePath = path.join(claudeDir, filename);

      const refBlock = `## ${section.title}\n\n@${relRefPath}\n`;
      newContent += refBlock + '\n';

      extractedFiles.push({
        filePath,
        content: section.content,
        sectionTitle: section.title,
        refPath: relRefPath,
      });

      tokensSaved += section.tokens - countTokens(refBlock);
    } else {
      // Keep section as-is, normalise trailing newline
      newContent += section.content.trimEnd() + '\n\n';
    }
  }

  return {
    claudeMdPath,
    newClaudeMd: newContent.trimEnd() + '\n',
    extractedFiles,
    tokensSaved: Math.max(0, tokensSaved),
  };
}

/**
 * Apply the planned split: write extracted files and overwrite CLAUDE.md.
 * Backs up CLAUDE.md before overwriting so the user can run `claudectx revert` to undo.
 */
export async function applySplit(result: SplitResult): Promise<void> {
  if (result.extractedFiles.length === 0) return;

  // Back up original CLAUDE.md before modifying
  if (fs.existsSync(result.claudeMdPath)) {
    await backupFile(result.claudeMdPath, 'optimize');
  }

  const claudeDir = path.dirname(result.extractedFiles[0].filePath);
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  for (const file of result.extractedFiles) {
    fs.writeFileSync(file.filePath, file.content, 'utf-8');
  }

  fs.writeFileSync(result.claudeMdPath, result.newClaudeMd, 'utf-8');
}
