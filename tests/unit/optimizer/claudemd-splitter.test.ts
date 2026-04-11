import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  parseSections,
  planSplit,
  applySplit,
  SPLIT_MIN_TOKENS,
} from '../../../src/optimizer/claudemd-splitter.js';

const SAMPLE_CLAUDEMD = `# My Project

Some intro text here.

## Commands

Run \`npm start\` to launch the dev server.
Run \`npm test\` to run tests.
These are short commands, under the token threshold.

## Architecture

${Array(80).fill('This is a detailed architecture description sentence that adds tokens.').join('\n')}

## Quick Reference

Just a few short lines here.
Not much content.
`;

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudectx-test-'));
}

describe('parseSections', () => {
  it('returns a preamble section for content before first ##', () => {
    const sections = parseSections(SAMPLE_CLAUDEMD);
    const preamble = sections.find((s) => s.isPreamble);
    expect(preamble).toBeTruthy();
    expect(preamble?.content).toContain('# My Project');
  });

  it('correctly identifies ## section titles', () => {
    const sections = parseSections(SAMPLE_CLAUDEMD);
    const titles = sections.filter((s) => !s.isPreamble).map((s) => s.title);
    expect(titles).toContain('Commands');
    expect(titles).toContain('Architecture');
    expect(titles).toContain('Quick Reference');
  });

  it('assigns token counts > 0 to each section', () => {
    const sections = parseSections(SAMPLE_CLAUDEMD);
    for (const s of sections) {
      expect(s.tokens).toBeGreaterThan(0);
    }
  });

  it('large section has more tokens than small section', () => {
    const sections = parseSections(SAMPLE_CLAUDEMD);
    const arch = sections.find((s) => s.title === 'Architecture')!;
    const quick = sections.find((s) => s.title === 'Quick Reference')!;
    expect(arch.tokens).toBeGreaterThan(quick.tokens);
  });

  it('handles content with no ## sections', () => {
    const sections = parseSections('# Only a top-level heading\nSome text here.');
    expect(sections.length).toBe(1);
    expect(sections[0].isPreamble).toBe(true);
  });
});

describe('planSplit', () => {
  let tmpDir: string;
  let claudeMdPath: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, SAMPLE_CLAUDEMD);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty extractedFiles when no sections selected', () => {
    const result = planSplit(claudeMdPath, []);
    expect(result.extractedFiles).toHaveLength(0);
    expect(result.tokensSaved).toBe(0);
  });

  it('extracts selected section and replaces with @reference', () => {
    const result = planSplit(claudeMdPath, ['Architecture']);
    expect(result.extractedFiles).toHaveLength(1);
    expect(result.extractedFiles[0].sectionTitle).toBe('Architecture');
    expect(result.newClaudeMd).toContain('@.claude/architecture.md');
    expect(result.newClaudeMd).not.toContain('This is a detailed architecture description');
  });

  it('keeps non-extracted sections intact', () => {
    const result = planSplit(claudeMdPath, ['Architecture']);
    expect(result.newClaudeMd).toContain('## Commands');
    expect(result.newClaudeMd).toContain('npm start');
  });

  it('saves tokens when a large section is extracted', () => {
    const result = planSplit(claudeMdPath, ['Architecture']);
    expect(result.tokensSaved).toBeGreaterThan(0);
  });

  it('generates slug filename from section title', () => {
    const result = planSplit(claudeMdPath, ['Quick Reference']);
    expect(result.extractedFiles[0].refPath).toBe('.claude/quick-reference.md');
  });

  it('extracted file content includes the ## header', () => {
    const result = planSplit(claudeMdPath, ['Architecture']);
    expect(result.extractedFiles[0].content).toContain('## Architecture');
  });
});

describe('applySplit', () => {
  let tmpDir: string;
  let claudeMdPath: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    claudeMdPath = path.join(tmpDir, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, SAMPLE_CLAUDEMD);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes extracted file to .claude/ directory', () => {
    const result = planSplit(claudeMdPath, ['Architecture']);
    applySplit(result);
    expect(fs.existsSync(result.extractedFiles[0].filePath)).toBe(true);
  });

  it('overwrites CLAUDE.md with the new content', () => {
    const result = planSplit(claudeMdPath, ['Architecture']);
    applySplit(result);
    const written = fs.readFileSync(claudeMdPath, 'utf-8');
    expect(written).toContain('@.claude/architecture.md');
    expect(written).not.toContain('This is a detailed architecture description');
  });

  it('creates .claude/ directory if it does not exist', () => {
    const result = planSplit(claudeMdPath, ['Architecture']);
    const claudeDir = path.join(tmpDir, '.claude');
    expect(fs.existsSync(claudeDir)).toBe(false);
    applySplit(result);
    expect(fs.existsSync(claudeDir)).toBe(true);
  });

  it('SPLIT_MIN_TOKENS is a positive number', () => {
    expect(SPLIT_MIN_TOKENS).toBeGreaterThan(0);
  });
});
