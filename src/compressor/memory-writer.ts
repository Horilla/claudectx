/**
 * Reads, writes, and prunes MEMORY.md entries.
 *
 * Entry format — each entry is wrapped in HTML comments so the writer
 * can identify and remove old ones during pruning:
 *
 *   <!-- claudectx-entry: 2026-04-11 | session: abc12345 -->
 *   ### [2026-04-11] Session abc12345…
 *
 *   <summary body>
 *
 *   ---
 */
import * as fs from 'fs';
import * as path from 'path';



export interface MemoryEntry {
  date: string; // ISO date string YYYY-MM-DD
  sessionId: string;
  raw: string; // full block including markers
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parse all claudectx-managed entries from a MEMORY.md file.
 * Unmanaged content (before the first marker) is preserved as-is.
 */
export function parseMemoryFile(filePath: string): {
  preamble: string;
  entries: MemoryEntry[];
} {
  if (!fs.existsSync(filePath)) {
    return { preamble: '', entries: [] };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const markerRegex = /<!-- claudectx-entry: (\d{4}-\d{2}-\d{2}) \| session: ([a-z0-9-]+) -->/g;

  // Split into blocks at each marker
  const indices: number[] = [];
  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    match = markerRegex.exec(content);
    if (!match) break;
    indices.push(match.index);
  }

  if (indices.length === 0) {
    return { preamble: content, entries: [] };
  }

  const preamble = content.slice(0, indices[0]);
  const entries: MemoryEntry[] = [];

  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : content.length;
    const block = content.slice(start, end).trim();

    // Re-parse the marker from the block to get date + sessionId
    const headerMatch = block.match(
      /<!-- claudectx-entry: (\d{4}-\d{2}-\d{2}) \| session: ([a-z0-9-]+) -->/
    );
    if (!headerMatch) continue;

    entries.push({
      date: headerMatch[1],
      sessionId: headerMatch[2],
      raw: block,
    });
  }

  return { preamble, entries };
}

// ─── Writing ──────────────────────────────────────────────────────────────────

/**
 * Build a MEMORY.md entry block for a session summary.
 */
export function buildEntryBlock(
  sessionId: string,
  summaryText: string,
  date = new Date()
): string {
  const dateStr = date.toISOString().slice(0, 10);
  const shortId = sessionId.slice(0, 8);
  const heading = `### [${dateStr}] Session ${shortId}…`;

  return [
    `<!-- claudectx-entry: ${dateStr} | session: ${sessionId} -->`,
    heading,
    '',
    summaryText.trim(),
    '',
    '---',
  ].join('\n');
}

/**
 * Append a new entry to MEMORY.md, creating the file if it doesn't exist.
 * Returns the final file content.
 */
export function appendEntry(
  memoryFilePath: string,
  sessionId: string,
  summaryText: string,
  date = new Date()
): string {
  const { preamble, entries } = parseMemoryFile(memoryFilePath);

  // Check for duplicate (same session already compressed)
  if (entries.some((e) => e.sessionId === sessionId)) {
    throw new Error(`Session ${sessionId.slice(0, 8)} is already in MEMORY.md`);
  }

  const newBlock = buildEntryBlock(sessionId, summaryText, date);
  const allBlocks = [...entries.map((e) => e.raw), newBlock];

  const newContent =
    (preamble.trimEnd() ? preamble.trimEnd() + '\n\n' : '') +
    allBlocks.join('\n\n') +
    '\n';

  const dir = path.dirname(memoryFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(memoryFilePath, newContent, 'utf-8');

  return newContent;
}

// ─── Pruning ──────────────────────────────────────────────────────────────────

export interface PruneResult {
  removed: number;
  kept: number;
  removedEntries: MemoryEntry[];
}

/**
 * Remove entries older than `days` days from MEMORY.md.
 * Returns what was removed and what was kept.
 */
export function pruneOldEntries(memoryFilePath: string, days: number): PruneResult {
  if (!fs.existsSync(memoryFilePath)) {
    return { removed: 0, kept: 0, removedEntries: [] };
  }

  const { preamble, entries } = parseMemoryFile(memoryFilePath);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const kept = entries.filter((e) => e.date >= cutoffStr);
  const removed = entries.filter((e) => e.date < cutoffStr);

  if (removed.length === 0) {
    return { removed: 0, kept: kept.length, removedEntries: [] };
  }

  const newContent =
    (preamble.trimEnd() ? preamble.trimEnd() + '\n\n' : '') +
    kept.map((e) => e.raw).join('\n\n') +
    (kept.length > 0 ? '\n' : '');

  fs.writeFileSync(memoryFilePath, newContent, 'utf-8');

  return { removed: removed.length, kept: kept.length, removedEntries: removed };
}

/**
 * Check if a session has already been compressed into MEMORY.md.
 */
export function isAlreadyCompressed(memoryFilePath: string, sessionId: string): boolean {
  const { entries } = parseMemoryFile(memoryFilePath);
  return entries.some((e) => e.sessionId === sessionId);
}
