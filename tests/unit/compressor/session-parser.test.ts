import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseSessionFile, buildConversationText } from '../../../src/compressor/session-parser.js';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'claudectx-parser-test-'));

function writeTmp(name: string, lines: object[]): string {
  const p = path.join(TMP_DIR, name);
  fs.writeFileSync(p, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return p;
}

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true });
});

describe('parseSessionFile', () => {
  it('returns null for missing file', () => {
    expect(parseSessionFile('/does/not/exist.jsonl')).toBeNull();
  });

  it('returns a session with no turns for an empty file', () => {
    const p = path.join(TMP_DIR, 'empty.jsonl');
    fs.writeFileSync(p, '');
    const session = parseSessionFile(p);
    expect(session).not.toBeNull();
    expect(session!.turns).toHaveLength(0);
    expect(session!.totalUsage.inputTokens).toBe(0);
  });

  it('parses user and assistant turns', () => {
    const p = writeTmp('basic.jsonl', [
      {
        type: 'message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Fix the bug please' }],
          usage: { input_tokens: 100, output_tokens: 0 },
        },
      },
      {
        type: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Done! I fixed it.' }],
          usage: { input_tokens: 200, output_tokens: 50 },
        },
      },
    ]);

    const session = parseSessionFile(p);
    expect(session).not.toBeNull();
    expect(session!.turns).toHaveLength(2);
    expect(session!.turns[0].role).toBe('user');
    expect(session!.turns[0].text).toBe('Fix the bug please');
    expect(session!.turns[1].role).toBe('assistant');
    expect(session!.totalUsage.inputTokens).toBe(300);
    expect(session!.totalUsage.outputTokens).toBe(50);
  });

  it('extracts file reads and edits from tool calls', () => {
    const p = writeTmp('tools.jsonl', [
      {
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', name: 'Read', input: { file_path: '/src/foo.ts' } },
            { type: 'tool_use', name: 'Edit', input: { file_path: '/src/foo.ts' } },
            { type: 'tool_use', name: 'Write', input: { file_path: '/src/bar.ts' } },
            { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
          ],
        },
      },
    ]);

    const session = parseSessionFile(p);
    expect(session!.filesRead).toContain('/src/foo.ts');
    expect(session!.filesEdited).toContain('/src/foo.ts');
    expect(session!.filesCreated).toContain('/src/bar.ts');
    expect(session!.commandsRun).toContain('npm test');
  });

  it('skips malformed JSON lines gracefully', () => {
    const p = path.join(TMP_DIR, 'malformed.jsonl');
    fs.writeFileSync(
      p,
      [
        'NOT VALID JSON',
        JSON.stringify({
          type: 'message',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        }),
      ].join('\n')
    );

    const session = parseSessionFile(p);
    expect(session).not.toBeNull();
    expect(session!.turns).toHaveLength(1);
  });

  it('tracks cache_read_input_tokens', () => {
    const p = writeTmp('cache.jsonl', [
      {
        type: 'message',
        message: {
          role: 'assistant',
          content: [],
          usage: { input_tokens: 500, output_tokens: 20, cache_read_input_tokens: 300 },
        },
      },
    ]);

    const session = parseSessionFile(p);
    expect(session!.totalUsage.cacheReadTokens).toBe(300);
  });

  it('extracts sessionId from filename', () => {
    const p = writeTmp('abc12345-def6-7890-ghij-klmnopqrstuv.jsonl', [
      {
        type: 'message',
        message: { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      },
    ]);

    const session = parseSessionFile(p);
    expect(session!.sessionId).toBe('abc12345-def6-7890-ghij-klmnopqrstuv');
  });
});

describe('buildConversationText', () => {
  let sessionPath: string;

  beforeAll(() => {
    sessionPath = writeTmp('conv.jsonl', [
      {
        type: 'message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Please add a login form' }],
        },
      },
      {
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will create the form now.' },
            { type: 'tool_use', name: 'Write', input: { file_path: '/src/login.ts' } },
          ],
        },
      },
    ]);
  });

  it('includes USER and ASSISTANT labels', () => {
    const session = parseSessionFile(sessionPath)!;
    const text = buildConversationText(session);
    expect(text).toContain('USER:');
    expect(text).toContain('ASSISTANT:');
  });

  it('includes tool names in brackets', () => {
    const session = parseSessionFile(sessionPath)!;
    const text = buildConversationText(session);
    expect(text).toContain('[tools: Write]');
  });

  it('truncates at maxChars', () => {
    const session = parseSessionFile(sessionPath)!;
    const text = buildConversationText(session, 20);
    expect(text).toContain('…(truncated)');
    expect(text.length).toBeLessThan(60);
  });
});
