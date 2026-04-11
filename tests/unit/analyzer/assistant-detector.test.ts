import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  detectAssistants,
  analyzeAssistantConfig,
  detectGenericWaste,
} from '../../../src/analyzer/assistant-detector.js';
import {
  claudeMdToCursorRules,
  claudeMdToCopilot,
} from '../../../src/commands/convert.js';
import { WASTE_THRESHOLDS } from '../../../src/shared/constants.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudectx-assist-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('detectAssistants', () => {
  it('returns only claude when only CLAUDE.md is present', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Project');

    const { detected } = detectAssistants(tmpDir);

    expect(detected).toContain('claude');
    expect(detected).not.toContain('cursor');
    expect(detected).not.toContain('copilot');
  });

  it('returns cursor and claude when both CLAUDE.md and .cursorrules exist', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Project');
    fs.writeFileSync(path.join(tmpDir, '.cursorrules'), '# Cursor rules');

    const { detected } = detectAssistants(tmpDir);

    expect(detected).toContain('claude');
    expect(detected).toContain('cursor');
  });

  it('returns copilot when .github/copilot-instructions.md exists', () => {
    const githubDir = path.join(tmpDir, '.github');
    fs.mkdirSync(githubDir, { recursive: true });
    fs.writeFileSync(path.join(githubDir, 'copilot-instructions.md'), '# Copilot');

    const { detected } = detectAssistants(tmpDir);

    expect(detected).toContain('copilot');
  });

  it('returns empty detected array when no config files exist', () => {
    const { detected } = detectAssistants(tmpDir);
    expect(detected).toEqual([]);
  });
});

describe('analyzeAssistantConfig', () => {
  it('returns a config with correct tokenCount for cursor .cursorrules', () => {
    const content = '# Cursor Rules\n'.repeat(20);
    fs.writeFileSync(path.join(tmpDir, '.cursorrules'), content);

    const config = analyzeAssistantConfig('cursor', tmpDir);

    expect(config.assistantId).toBe('cursor');
    expect(config.configFiles.length).toBeGreaterThan(0);
    expect(config.totalTokens).toBeGreaterThan(0);
  });

  it('returns empty config when no files exist for the assistant', () => {
    const config = analyzeAssistantConfig('windsurf', tmpDir);

    expect(config.configFiles).toEqual([]);
    expect(config.totalTokens).toBe(0);
    expect(config.warnings).toEqual([]);
  });
});

describe('detectGenericWaste', () => {
  it('flags OVERSIZED_CLAUDEMD when content exceeds token threshold', () => {
    const bigContent = 'word '.repeat(5000); // well over MAX_CLAUDEMD_TOKENS
    const bigTokenCount = WASTE_THRESHOLDS.MAX_CLAUDEMD_TOKENS + 500;

    const warnings = detectGenericWaste(bigContent, '/project/.cursorrules', bigTokenCount);

    expect(warnings.some((w) => w.code === 'OVERSIZED_CLAUDEMD')).toBe(true);
  });

  it('returns no warnings for a small, clean file', () => {
    const content = '# Simple project rules\nUse TypeScript.\n';
    const warnings = detectGenericWaste(content, '/project/.cursorrules', 10);

    expect(warnings).toEqual([]);
  });

  it('flags CACHE_BUSTING_CONTENT when a date string is present', () => {
    const content = '# Rules\nLast updated: 2026-04-12\n';
    const warnings = detectGenericWaste(content, '/project/CLAUDE.md', 50);

    expect(warnings.some((w) => w.code === 'CACHE_BUSTING_CONTENT')).toBe(true);
  });
});

describe('claudeMdToCursorRules', () => {
  it('splits a two-section CLAUDE.md into two .mdc files', () => {
    const content = '## Section One\nContent of section one.\n\n## Section Two\nContent of section two.\n';
    const files = claudeMdToCursorRules(content);

    expect(files.length).toBe(2);
    expect(files[0].filename).toMatch(/\.mdc$/);
    expect(files[1].filename).toMatch(/\.mdc$/);
  });

  it('slugifies header names for filenames', () => {
    const content = '## Django Best Practices\nAlways use models.\n';
    const files = claudeMdToCursorRules(content);

    expect(files[0].filename).toBe('django-best-practices.mdc');
  });

  it('includes alwaysApply: true in the YAML frontmatter', () => {
    const content = '## My Section\nHello.\n';
    const files = claudeMdToCursorRules(content);

    expect(files[0].content).toContain('alwaysApply: true');
  });

  it('returns a single fallback file when there are no ## headers', () => {
    const content = 'Just a flat document with no sections.\n';
    const files = claudeMdToCursorRules(content);

    expect(files.length).toBe(1);
    expect(files[0].filename).toBe('project-instructions.mdc');
  });
});

describe('claudeMdToCopilot', () => {
  it('strips @file reference lines', () => {
    const content = '@src/rules.ts\n\n# My Project\n\nUse TypeScript.\n';
    const result = claudeMdToCopilot(content);

    expect(result).not.toContain('@src/rules.ts');
    expect(result).toContain('My Project');
  });

  it('preserves section bodies', () => {
    const content = '## Stack\nDjango + React.\n\n## Testing\nUse pytest.\n';
    const result = claudeMdToCopilot(content);

    expect(result).toContain('Django + React');
    expect(result).toContain('Use pytest');
  });
});
