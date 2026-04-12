import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readSessionUsage,
  projectNameFromDir,
} from '../../../src/watcher/session-reader.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudectx-reader-test-'));
}

// ─── Helper to build JSONL lines ──────────────────────────────────────────────

function assistantLine(
  inputTokens: number,
  outputTokens: number,
  cacheCreation = 0,
  cacheRead = 0
): string {
  return JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [],
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: cacheCreation,
        cache_read_input_tokens: cacheRead,
      },
    },
  });
}

function userLine(): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' } });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('readSessionUsage', () => {
  let tmpDir: string;
  let sessionFile: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    sessionFile = path.join(tmpDir, 'session.jsonl');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns zero usage for a missing file', async () => {
    const usage = await readSessionUsage('/nonexistent/path.jsonl');
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.requestCount).toBe(0);
  });

  it('returns zero usage for an empty file', async () => {
    fs.writeFileSync(sessionFile, '');
    const usage = await readSessionUsage(sessionFile);
    expect(usage.inputTokens).toBe(0);
    expect(usage.requestCount).toBe(0);
  });

  it('sums input and output tokens from assistant messages', async () => {
    fs.writeFileSync(
      sessionFile,
      [userLine(), assistantLine(1000, 200), userLine(), assistantLine(800, 150)].join('\n') + '\n'
    );
    const usage = await readSessionUsage(sessionFile);
    expect(usage.inputTokens).toBe(1800);
    expect(usage.outputTokens).toBe(350);
    expect(usage.requestCount).toBe(2);
  });

  it('sums cache creation and cache read tokens', async () => {
    fs.writeFileSync(
      sessionFile,
      [assistantLine(1000, 200, 500, 300), assistantLine(800, 150, 0, 400)].join('\n') + '\n'
    );
    const usage = await readSessionUsage(sessionFile);
    expect(usage.cacheCreationTokens).toBe(500);
    expect(usage.cacheReadTokens).toBe(700);
  });

  it('ignores user-role lines (does not count their usage)', async () => {
    fs.writeFileSync(sessionFile, userLine() + '\n');
    const usage = await readSessionUsage(sessionFile);
    expect(usage.requestCount).toBe(0);
  });

  it('skips malformed JSON lines', async () => {
    fs.writeFileSync(
      sessionFile,
      [assistantLine(500, 100), 'NOT JSON', assistantLine(300, 50)].join('\n') + '\n'
    );
    const usage = await readSessionUsage(sessionFile);
    expect(usage.inputTokens).toBe(800);
    expect(usage.requestCount).toBe(2);
  });

  it('handles lines with no usage field gracefully', async () => {
    const noUsage = JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [] } });
    fs.writeFileSync(sessionFile, noUsage + '\n' + assistantLine(100, 20) + '\n');
    const usage = await readSessionUsage(sessionFile);
    // Only the line with usage should be counted
    expect(usage.inputTokens).toBe(100);
    expect(usage.requestCount).toBe(1);
  });

  it('also reads top-level usage field (alternative format)', async () => {
    const altFormat = JSON.stringify({
      type: 'assistant',
      usage: { input_tokens: 200, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });
    fs.writeFileSync(sessionFile, altFormat + '\n');
    const usage = await readSessionUsage(sessionFile);
    expect(usage.inputTokens).toBe(200);
  });
});

describe('projectNameFromDir', () => {
  it('returns the last segment of a dashed path', () => {
    expect(projectNameFromDir('-Users-alice-code-myapp')).toBe('myapp');
  });

  it('handles single-segment names', () => {
    expect(projectNameFromDir('myapp')).toBe('myapp');
  });

  it('handles empty string gracefully', () => {
    const result = projectNameFromDir('');
    expect(typeof result).toBe('string');
  });
});
