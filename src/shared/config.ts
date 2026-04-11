import Conf from 'conf';
import type { ClaudeCtxConfig } from './types.js';

const conf = new Conf<ClaudeCtxConfig>({
  projectName: 'claudectx',
  defaults: {
    defaultModel: 'claude-sonnet-4-6',
    maxMemoryTokens: 3000,
    maxClaudeMdTokens: 2000,
    watchPollIntervalMs: 2000,
  },
});

export function getConfig(): ClaudeCtxConfig {
  return conf.store as ClaudeCtxConfig;
}

export function setConfig(key: keyof ClaudeCtxConfig, value: unknown): void {
  conf.set(key, value);
}

export function getApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || conf.get('anthropicApiKey');
}
