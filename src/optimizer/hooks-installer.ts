import * as fs from 'fs';
import * as path from 'path';

export interface HooksResult {
  settingsPath: string;
  existed: boolean;
  mergedSettings: Record<string, unknown>;
}

/**
 * claudectx hooks to inject into .claude/settings.local.json
 *
 * PostToolUse / Read → log the file path + line count so `claudectx watch`
 * can track token spend per file across the session.
 */
const CLAUDECTX_HOOKS = {
  PostToolUse: [
    {
      // Pipe the hook JSON payload to `claudectx watch --log-stdin`.
      // Claude Code passes { tool_name, tool_input, tool_response, session_id }
      // via stdin when the PostToolUse hook fires.
      matcher: 'Read',
      hooks: [
        {
          type: 'command',
          command: 'claudectx watch --log-stdin',
        },
      ],
    },
  ],
};

/**
 * Build the merged settings object without touching the filesystem.
 * We write to settings.local.json (not settings.json) so the changes
 * aren't accidentally committed.
 */
export function planHooksInstall(projectRoot: string): HooksResult {
  const claudeDir = path.join(projectRoot, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.local.json');
  const existed = fs.existsSync(settingsPath);

  let existing: Record<string, unknown> = {};
  if (existed) {
    try {
      existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      // malformed JSON — start fresh
      existing = {};
    }
  }

  // Merge: preserve any existing hooks, append ours under PostToolUse
  const existingHooks = (existing.hooks as Record<string, unknown>) ?? {};
  const existingPostToolUse = (existingHooks.PostToolUse as unknown[]) ?? [];

  // Avoid duplicating our own hook if already installed
  const alreadyInstalled = existingPostToolUse.some(
    (h) =>
      typeof h === 'object' &&
      h !== null &&
      (h as Record<string, unknown>).matcher === 'Read' &&
      JSON.stringify(h).includes('claudectx')
  );

  const mergedPostToolUse = alreadyInstalled
    ? existingPostToolUse
    : [...existingPostToolUse, ...CLAUDECTX_HOOKS.PostToolUse];

  const mergedSettings: Record<string, unknown> = {
    ...existing,
    hooks: {
      ...existingHooks,
      PostToolUse: mergedPostToolUse,
    },
  };

  return { settingsPath, existed, mergedSettings };
}

/**
 * Write the merged settings to disk.
 */
export function applyHooksInstall(result: HooksResult): void {
  const dir = path.dirname(result.settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(result.settingsPath, JSON.stringify(result.mergedSettings, null, 2) + '\n', 'utf-8');
}

/**
 * Write arbitrary merged settings to .claude/settings.local.json.
 * Used by the hooks marketplace to add/remove named hooks.
 */
export function writeHooksSettings(
  projectRoot: string,
  mergedSettings: unknown,
): void {
  const settingsPath = path.join(projectRoot, '.claude', 'settings.local.json');
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2) + '\n', 'utf-8');
}

/**
 * Check whether claudectx hooks are already installed in a project.
 */
export function isAlreadyInstalled(projectRoot: string): boolean {
  const settingsPath = path.join(projectRoot, '.claude', 'settings.local.json');
  if (!fs.existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const postToolUse = settings?.hooks?.PostToolUse ?? [];
    return postToolUse.some((h: Record<string, unknown>) => h.matcher === 'Read');
  } catch {
    return false;
  }
}
