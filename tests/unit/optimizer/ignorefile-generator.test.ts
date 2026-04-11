import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateIgnorefile, writeIgnorefile } from '../../../src/optimizer/ignorefile-generator.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudectx-test-'));
}

describe('ignorefile-generator', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects generic project when no markers present', () => {
    const result = generateIgnorefile(tmpDir);
    expect(result.projectTypes).toEqual([]);
    expect(result.existed).toBe(false);
    expect(result.content).toContain('.git/');
    expect(result.content).toContain('node_modules/');
    expect(result.content).not.toContain('migrations/'); // python-only
  });

  it('detects node project via package.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    const result = generateIgnorefile(tmpDir);
    expect(result.projectTypes).toContain('node');
    expect(result.content).toContain('package-lock.json');
  });

  it('detects python project via manage.py', () => {
    fs.writeFileSync(path.join(tmpDir, 'manage.py'), '');
    const result = generateIgnorefile(tmpDir);
    expect(result.projectTypes).toContain('python');
    expect(result.content).toContain('migrations/');
  });

  it('detects python project via requirements.txt', () => {
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), '');
    const result = generateIgnorefile(tmpDir);
    expect(result.projectTypes).toContain('python');
  });

  it('detects rust project via Cargo.toml', () => {
    fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '');
    const result = generateIgnorefile(tmpDir);
    expect(result.projectTypes).toContain('rust');
    expect(result.content).toContain('Cargo.lock');
  });

  it('detects multiple project types', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'go.mod'), '');
    const result = generateIgnorefile(tmpDir);
    expect(result.projectTypes).toContain('node');
    expect(result.projectTypes).toContain('go');
    expect(result.content).toContain('go.sum');
    expect(result.content).toContain('package-lock.json');
  });

  it('writeIgnorefile creates new file', () => {
    const result = generateIgnorefile(tmpDir);
    writeIgnorefile(result);
    const written = fs.readFileSync(result.filePath, 'utf-8');
    expect(written).toContain('.git/');
    expect(written).toContain('node_modules/');
  });

  it('writeIgnorefile appends when file already exists', () => {
    const filePath = path.join(tmpDir, '.claudeignore');
    fs.writeFileSync(filePath, '# existing content\n*.custom\n');
    const result = generateIgnorefile(tmpDir);
    result.existed = true;
    writeIgnorefile(result);
    const written = fs.readFileSync(filePath, 'utf-8');
    expect(written).toContain('*.custom');
    expect(written).toContain('.git/');
  });

  it('result marks existed correctly', () => {
    const filePath = path.join(tmpDir, '.claudeignore');
    fs.writeFileSync(filePath, '');
    const result = generateIgnorefile(tmpDir);
    expect(result.existed).toBe(true);
  });
});
