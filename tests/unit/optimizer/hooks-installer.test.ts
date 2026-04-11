import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  planHooksInstall,
  applyHooksInstall,
  isAlreadyInstalled,
} from '../../../src/optimizer/hooks-installer.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudectx-hooks-test-'));
}

describe('planHooksInstall', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('targets settings.local.json inside .claude/', () => {
    const result = planHooksInstall(tmpDir);
    expect(result.settingsPath).toContain('.claude');
    expect(result.settingsPath).toContain('settings.local.json');
  });

  it('marks existed=false when file does not exist', () => {
    const result = planHooksInstall(tmpDir);
    expect(result.existed).toBe(false);
  });

  it('marks existed=true when file already exists', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(path.join(claudeDir, 'settings.local.json'), '{}');
    const result = planHooksInstall(tmpDir);
    expect(result.existed).toBe(true);
  });

  it('mergedSettings contains PostToolUse hook', () => {
    const result = planHooksInstall(tmpDir);
    const hooks = result.mergedSettings.hooks as Record<string, unknown>;
    expect(hooks).toBeDefined();
    expect(Array.isArray(hooks.PostToolUse)).toBe(true);
    const postToolUse = hooks.PostToolUse as Array<Record<string, unknown>>;
    expect(postToolUse.some((h) => h.matcher === 'Read')).toBe(true);
  });

  it('preserves existing settings when merging', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(
      path.join(claudeDir, 'settings.local.json'),
      JSON.stringify({ customSetting: 'hello' })
    );
    const result = planHooksInstall(tmpDir);
    expect(result.mergedSettings.customSetting).toBe('hello');
  });

  it('preserves existing hooks when merging', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir);
    const existing = {
      hooks: {
        PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo write' }] }],
      },
    };
    fs.writeFileSync(path.join(claudeDir, 'settings.local.json'), JSON.stringify(existing));
    const result = planHooksInstall(tmpDir);
    const postToolUse = (result.mergedSettings.hooks as Record<string, unknown[]>).PostToolUse;
    expect(postToolUse.some((h: Record<string, unknown>) => h.matcher === 'Write')).toBe(true);
    expect(postToolUse.some((h: Record<string, unknown>) => h.matcher === 'Read')).toBe(true);
  });

  it('does not duplicate Read hook if already present', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir);
    const existing = {
      hooks: {
        PostToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'claudectx watch --log-read' }] }],
      },
    };
    fs.writeFileSync(path.join(claudeDir, 'settings.local.json'), JSON.stringify(existing));
    const result = planHooksInstall(tmpDir);
    const postToolUse = (result.mergedSettings.hooks as Record<string, unknown[]>).PostToolUse;
    const readHooks = postToolUse.filter((h: Record<string, unknown>) => h.matcher === 'Read');
    expect(readHooks).toHaveLength(1);
  });
});

describe('applyHooksInstall', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .claude/ directory if missing', () => {
    const result = planHooksInstall(tmpDir);
    applyHooksInstall(result);
    expect(fs.existsSync(path.join(tmpDir, '.claude'))).toBe(true);
  });

  it('writes valid JSON to settings.local.json', () => {
    const result = planHooksInstall(tmpDir);
    applyHooksInstall(result);
    const written = fs.readFileSync(result.settingsPath, 'utf-8');
    expect(() => JSON.parse(written)).not.toThrow();
  });

  it('written file contains Read hook', () => {
    const result = planHooksInstall(tmpDir);
    applyHooksInstall(result);
    const settings = JSON.parse(fs.readFileSync(result.settingsPath, 'utf-8'));
    const postToolUse = settings.hooks.PostToolUse;
    expect(postToolUse.some((h: Record<string, unknown>) => h.matcher === 'Read')).toBe(true);
  });
});

describe('isAlreadyInstalled', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false when .claude/ does not exist', () => {
    expect(isAlreadyInstalled(tmpDir)).toBe(false);
  });

  it('returns false when settings.local.json has no hooks', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(path.join(claudeDir, 'settings.local.json'), '{}');
    expect(isAlreadyInstalled(tmpDir)).toBe(false);
  });

  it('returns true after applyHooksInstall', () => {
    const result = planHooksInstall(tmpDir);
    applyHooksInstall(result);
    expect(isAlreadyInstalled(tmpDir)).toBe(true);
  });
});
