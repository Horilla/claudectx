import fs from 'fs';
import path from 'path';
import { countTokens } from './tokenizer.js';
import { WASTE_THRESHOLDS, CACHE_BUSTERS } from '../shared/constants.js';
import type { WasteWarning, WasteCode } from '../shared/types.js';

function warn(
  code: WasteCode,
  severity: WasteWarning['severity'],
  message: string,
  suggestion: string,
  estimatedSavings: number,
  lineNumber?: number,
): WasteWarning {
  return { code, severity, message, suggestion, estimatedSavings, lineNumber };
}

/** Detect waste patterns in CLAUDE.md content */
export function detectClaudeMdWarnings(
  content: string,
  tokenCount: number,
  referenceCount: number,
): WasteWarning[] {
  const warnings: WasteWarning[] = [];

  // OVERSIZED_CLAUDEMD
  if (tokenCount > WASTE_THRESHOLDS.MAX_CLAUDEMD_TOKENS) {
    const excess = tokenCount - WASTE_THRESHOLDS.MAX_CLAUDEMD_TOKENS;
    const pct = Math.round((tokenCount / WASTE_THRESHOLDS.MAX_CLAUDEMD_TOKENS - 1) * 100);
    warnings.push(
      warn(
        'OVERSIZED_CLAUDEMD',
        'error',
        `CLAUDE.md is ${tokenCount.toLocaleString()} tokens — ${pct}% over the ${WASTE_THRESHOLDS.MAX_CLAUDEMD_TOKENS.toLocaleString()} token recommendation`,
        'Run `claudectx optimize --claudemd` to split into demand-loaded files',
        excess,
      ),
    );
  }

  // CACHE_BUSTING_CONTENT
  const lines = content.split('\n');
  for (const { pattern, label } of CACHE_BUSTERS) {
    pattern.lastIndex = 0; // reset regex state
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        warnings.push(
          warn(
            'CACHE_BUSTING_CONTENT',
            'warning',
            `${label} on line ${i + 1} breaks prompt caching`,
            'Remove or externalize dynamic content — static CLAUDE.md saves ~88% on repeated requests',
            0,
            i + 1,
          ),
        );
        break; // one warning per pattern type is enough
      }
      pattern.lastIndex = 0;
    }
  }

  // TOO_MANY_REFERENCES
  if (referenceCount > WASTE_THRESHOLDS.MAX_REFERENCE_COUNT) {
    warnings.push(
      warn(
        'TOO_MANY_REFERENCES',
        'warning',
        `CLAUDE.md has ${referenceCount} @referenced files — consider consolidating`,
        'Group related references into fewer files to reduce overhead',
        0,
      ),
    );
  }

  return warnings;
}

/** Detect waste patterns in MEMORY.md */
export function detectMemoryWarnings(content: string, tokenCount: number): WasteWarning[] {
  const warnings: WasteWarning[] = [];

  if (tokenCount > WASTE_THRESHOLDS.MAX_MEMORY_TOKENS) {
    const excess = tokenCount - WASTE_THRESHOLDS.MAX_MEMORY_TOKENS;
    warnings.push(
      warn(
        'OVERSIZED_MEMORY',
        'warning',
        `MEMORY.md is ${tokenCount.toLocaleString()} tokens — over the ${WASTE_THRESHOLDS.MAX_MEMORY_TOKENS.toLocaleString()} token recommendation`,
        'Run `claudectx compress --prune --days 30` to prune old entries',
        excess,
      ),
    );
  }

  return warnings;
}

/** Detect warnings for a referenced file */
export function detectReferenceFileWarnings(
  filePath: string,
  content: string,
  tokenCount: number,
): WasteWarning[] {
  const warnings: WasteWarning[] = [];

  if (tokenCount > WASTE_THRESHOLDS.MAX_REFERENCE_FILE_TOKENS) {
    warnings.push(
      warn(
        'LARGE_REFERENCE_FILE',
        'warning',
        `Referenced file ${path.basename(filePath)} is ${tokenCount.toLocaleString()} tokens`,
        'Split large reference files or move rarely-needed sections to separate files',
        tokenCount - WASTE_THRESHOLDS.MAX_REFERENCE_FILE_TOKENS,
      ),
    );
  }

  return warnings;
}

/** Check if a .claudeignore file is missing */
export function detectMissingIgnoreFile(projectRoot: string): WasteWarning | null {
  const ignorePath = path.join(projectRoot, '.claudeignore');
  if (!fs.existsSync(ignorePath)) {
    return warn(
      'MISSING_IGNOREFILE',
      'warning',
      'No .claudeignore file found — Claude may read node_modules, .git, dist/ etc.',
      'Run `claudectx optimize --ignorefile` to generate one',
      0,
    );
  }
  return null;
}

/** Check if prompt caching is not configured */
export function detectNoCachingConfigured(
  projectRoot: string,
  claudeMdContent?: string,
): WasteWarning | null {
  // Simple heuristic: if CLAUDE.md has cache-busting content, flag it
  // A proper check would inspect API call headers, which we can't do statically
  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath) && claudeMdContent) {
    // No settings file at all — caching is likely not configured
    return warn(
      'NO_CACHING_CONFIGURED',
      'info',
      'Prompt caching may not be configured — static context is re-billed on every request',
      'Run `claudectx optimize --cache` for caching recommendations',
      0,
    );
  }
  return null;
}

/** Estimate redundant content between CLAUDE.md and MEMORY.md */
export function detectRedundantContent(
  claudeMdContent: string,
  memoryContent?: string,
): WasteWarning | null {
  if (!memoryContent) return null;

  // Find lines that appear in both (exact duplicates)
  const claudeLines = new Set(
    claudeMdContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 20),
  );
  const memoryLines = memoryContent
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 20);

  const duplicates = memoryLines.filter((l) => claudeLines.has(l));

  if (duplicates.length > 3) {
    return warn(
      'REDUNDANT_CONTENT',
      'info',
      `${duplicates.length} lines appear in both CLAUDE.md and MEMORY.md`,
      'Remove duplicated content from MEMORY.md — CLAUDE.md is already injected every request',
      countTokens(duplicates.join('\n')),
    );
  }

  return null;
}
