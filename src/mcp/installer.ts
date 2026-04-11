/**
 * Auto-install the claudectx MCP server into .claude/settings.json
 * so Claude Code can discover it automatically.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface InstallResult {
  settingsPath: string;
  existed: boolean;
  alreadyInstalled: boolean;
  mergedSettings: Record<string, unknown>;
}

const SERVER_NAME = 'claudectx';

const SERVER_ENTRY = {
  command: 'claudectx',
  args: ['mcp'],
  type: 'stdio',
};

/**
 * Build the merged settings object.
 * Writes to `settings.json` (not settings.local.json) because MCP servers
 * are typically project-level config meant to be shared.
 */
export function planInstall(projectRoot: string): InstallResult {
  const claudeDir = path.join(projectRoot, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const existed = fs.existsSync(settingsPath);

  let existing: Record<string, unknown> = {};
  if (existed) {
    try {
      existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      existing = {};
    }
  }

  const mcpServers = (existing.mcpServers as Record<string, unknown>) ?? {};
  const alreadyInstalled = SERVER_NAME in mcpServers;

  const mergedSettings: Record<string, unknown> = {
    ...existing,
    mcpServers: {
      ...mcpServers,
      [SERVER_NAME]: SERVER_ENTRY,
    },
  };

  return { settingsPath, existed, alreadyInstalled, mergedSettings };
}

export function applyInstall(result: InstallResult): void {
  const dir = path.dirname(result.settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(
    result.settingsPath,
    JSON.stringify(result.mergedSettings, null, 2) + '\n',
    'utf-8'
  );
}

/**
 * Check whether the claudectx MCP server is already registered.
 */
export function isInstalled(projectRoot: string): boolean {
  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    return SERVER_NAME in (settings.mcpServers ?? {});
  } catch {
    return false;
  }
}
