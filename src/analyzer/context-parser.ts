import fs from 'fs';
import path from 'path';
import os from 'os';

export interface ParsedContext {
  projectClaudeMd?: { filePath: string; content: string };
  userClaudeMd?: { filePath: string; content: string };
  memoryMd?: { filePath: string; content: string };
  referencedFiles: Array<{ filePath: string; content: string; referencedAs: string }>;
  mcpToolCount: number;
  projectRoot: string | null;
}

/** Walk up from cwd looking for CLAUDE.md or .claude/ directory */
export function findProjectRoot(startDir: string = process.cwd()): string | null {
  let current = startDir;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (
      fs.existsSync(path.join(current, 'CLAUDE.md')) ||
      fs.existsSync(path.join(current, '.claude'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null; // reached filesystem root
    current = parent;
  }
}

/** Parse @filename references from CLAUDE.md content */
function extractReferences(content: string): string[] {
  const refs: string[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^@(.+)$/);
    if (match) refs.push(match[1].trim());
  }
  return refs;
}

/** Count MCP tools from .claude/settings.json */
function countMcpTools(settingsPath: string): number {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(raw);
    const servers = settings?.mcpServers ?? {};
    // Each server contributes ~3-6 tools on average — we can't know exactly without
    // querying the server, so we count registered servers and estimate 3 tools each
    return Object.keys(servers).length * 3;
  } catch {
    return 0;
  }
}

/** Read a file safely, returning null if not found */
function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Parse all Claude Code context files for a project.
 */
export function parseContext(projectPath: string): ParsedContext {
  const result: ParsedContext = {
    referencedFiles: [],
    mcpToolCount: 0,
    projectRoot: findProjectRoot(projectPath),
  };

  const root = result.projectRoot ?? projectPath;

  // Project CLAUDE.md
  const projectClaudeMdPath = path.join(root, 'CLAUDE.md');
  const projectClaudeMdContent = readFileSafe(projectClaudeMdPath);
  if (projectClaudeMdContent !== null) {
    result.projectClaudeMd = { filePath: projectClaudeMdPath, content: projectClaudeMdContent };
  }

  // User-level CLAUDE.md (~/.claude/CLAUDE.md)
  const userClaudeMdPath = path.join(os.homedir(), '.claude', 'CLAUDE.md');
  const userClaudeMdContent = readFileSafe(userClaudeMdPath);
  if (userClaudeMdContent !== null) {
    result.userClaudeMd = { filePath: userClaudeMdPath, content: userClaudeMdContent };
  }

  // MEMORY.md (.claude/MEMORY.md)
  const memoryPath = path.join(root, '.claude', 'MEMORY.md');
  const memoryContent = readFileSafe(memoryPath);
  if (memoryContent !== null) {
    result.memoryMd = { filePath: memoryPath, content: memoryContent };
  }

  // MCP tool count from settings
  const settingsPath = path.join(root, '.claude', 'settings.json');
  result.mcpToolCount = countMcpTools(settingsPath);

  // @referenced files from all CLAUDE.md files
  const allClaudeMdContent = [
    projectClaudeMdContent,
    userClaudeMdContent,
  ].filter(Boolean).join('\n');

  const refs = extractReferences(allClaudeMdContent);
  for (const ref of refs) {
    const refPath = path.isAbsolute(ref) ? ref : path.join(root, ref);
    const refContent = readFileSafe(refPath);
    if (refContent !== null) {
      result.referencedFiles.push({
        filePath: refPath,
        content: refContent,
        referencedAs: ref,
      });
    }
  }

  return result;
}
