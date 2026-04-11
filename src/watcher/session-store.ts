/**
 * Cross-process session store.
 *
 * The Claude Code PostToolUse hook writes a file-read event here each time
 * Claude reads a file. The watch dashboard polls this file for live updates.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface FileReadEvent {
  timestamp: string;
  filePath: string;
  sessionId?: string;
}

export interface FileStats {
  filePath: string;
  readCount: number;
  firstSeen: string;
  lastSeen: string;
}

// Computed lazily so os.homedir() can be mocked in tests
function getStoreDirPath(): string {
  return path.join(os.homedir(), '.claudectx');
}

function getReadsFilePath_(): string {
  return path.join(getStoreDirPath(), 'reads.jsonl');
}

function ensureStoreDir(): void {
  const dir = getStoreDirPath();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Append a file-read event. Called by the hook (runs in a separate process).
 */
export function appendFileRead(filePath: string, sessionId?: string): void {
  ensureStoreDir();
  const event: FileReadEvent = {
    timestamp: new Date().toISOString(),
    filePath,
    sessionId,
  };
  fs.appendFileSync(getReadsFilePath_(), JSON.stringify(event) + '\n', 'utf-8');
}

/**
 * Read all logged file-read events from disk.
 */
export function readAllEvents(): FileReadEvent[] {
  const readsFile = getReadsFilePath_();
  if (!fs.existsSync(readsFile)) return [];
  const lines = fs.readFileSync(readsFile, 'utf-8').trim().split('\n').filter(Boolean);
  return lines
    .map((line) => {
      try {
        return JSON.parse(line) as FileReadEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is FileReadEvent => e !== null);
}

/**
 * Aggregate raw events into per-file stats, sorted by read count descending.
 */
export function aggregateStats(events: FileReadEvent[]): FileStats[] {
  const map = new Map<string, FileStats>();
  for (const e of events) {
    const existing = map.get(e.filePath);
    if (existing) {
      existing.readCount++;
      existing.lastSeen = e.timestamp;
    } else {
      map.set(e.filePath, {
        filePath: e.filePath,
        readCount: 1,
        firstSeen: e.timestamp,
        lastSeen: e.timestamp,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.readCount - a.readCount);
}

/**
 * Clear the log (e.g. at session start).
 */
export function clearStore(): void {
  const readsFile = getReadsFilePath_();
  if (fs.existsSync(readsFile)) {
    fs.writeFileSync(readsFile, '', 'utf-8');
  }
}

export function getReadsFilePath(): string {
  return getReadsFilePath_();
}

export function getStoreDir(): string {
  return getStoreDirPath();
}
