import { describe, it, expect } from 'vitest';
import {
  HOOK_REGISTRY,
  getHook,
  interpolateCommand,
  buildHookEntry,
} from '../../../src/hooks/registry.js';
import { parseConfigPairs } from '../../../src/commands/hooks.js';

describe('getHook', () => {
  it('returns a HookDefinition for a known hook name', () => {
    const hook = getHook('auto-compress');
    expect(hook).toBeDefined();
    expect(hook?.triggerEvent).toBe('PostToolUse');
    expect(hook?.category).toBe('compression');
  });

  it('returns undefined for an unknown hook name', () => {
    expect(getHook('nonexistent-hook')).toBeUndefined();
  });

  it('all hooks in HOOK_REGISTRY have required fields', () => {
    for (const hook of HOOK_REGISTRY) {
      expect(hook.name).toBeTruthy();
      expect(hook.description).toBeTruthy();
      expect(hook.triggerEvent).toBeTruthy();
      expect(hook.commandTemplate).toBeTruthy();
      expect(hook.category).toBeTruthy();
    }
  });
});

describe('interpolateCommand', () => {
  it('replaces {{config.key}} with the provided value', () => {
    const result = interpolateCommand('cmd --key {{config.apiKey}}', { apiKey: 'sk-test' });
    expect(result).toBe('cmd --key sk-test');
  });

  it('leaves unresolved placeholders intact when key is missing', () => {
    const result = interpolateCommand('cmd --url {{config.webhookUrl}}', {});
    expect(result).toBe('cmd --url {{config.webhookUrl}}');
  });

  it('replaces multiple placeholders in one template', () => {
    const result = interpolateCommand(
      'cmd --key {{config.apiKey}} --limit {{config.limit}}',
      { apiKey: 'sk-abc', limit: 5 },
    );
    expect(result).toBe('cmd --key sk-abc --limit 5');
  });
});

describe('buildHookEntry', () => {
  it('produces an object with matcher and hooks array for auto-compress', () => {
    const def = getHook('auto-compress')!;
    const entry = buildHookEntry(def, { apiKey: 'sk-test', threshold: 50000 });

    expect(entry.matcher).toBe('Read');
    expect(Array.isArray(entry.hooks)).toBe(true);
    const hooks = entry.hooks as Array<{ type: string; command: string }>;
    expect(hooks[0].type).toBe('command');
    expect(hooks[0].command).toContain('claudectx compress');
  });

  it('produces an object without matcher for slack-digest (no matcher defined)', () => {
    const def = getHook('slack-digest')!;
    const entry = buildHookEntry(def, { webhookUrl: 'https://hooks.slack.com/test' });

    expect(entry.matcher).toBeUndefined();
    expect(Array.isArray(entry.hooks)).toBe(true);
  });

  it('produces a command for session-warmup that reads API key from env (no key in command)', () => {
    const def = getHook('session-warmup')!;
    const entry = buildHookEntry(def, {});

    const hooks = entry.hooks as Array<{ command: string }>;
    // API key must NOT be embedded in the stored command — it is read from ANTHROPIC_API_KEY at runtime
    expect(hooks[0].command).toBe('claudectx warmup');
    expect(hooks[0].command).not.toContain('--api-key');
  });
});

describe('parseConfigPairs', () => {
  it('parses key=value pairs into an object', () => {
    const result = parseConfigPairs([
      'webhookUrl=https://hooks.slack.com/test',
      'limit=5',
    ]);
    expect(result).toEqual({
      webhookUrl: 'https://hooks.slack.com/test',
      limit: '5',
    });
  });

  it('handles empty array', () => {
    expect(parseConfigPairs([])).toEqual({});
  });

  it('skips malformed pairs without an = sign', () => {
    const result = parseConfigPairs(['no-equals', 'key=value']);
    expect(result).toEqual({ key: 'value' });
  });

  it('handles values that contain = signs', () => {
    const result = parseConfigPairs(['url=https://example.com?a=1&b=2']);
    expect(result.url).toBe('https://example.com?a=1&b=2');
  });
});
