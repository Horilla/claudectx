import * as fs from 'fs';
import * as path from 'path';
import { findProjectRoot } from '../analyzer/context-parser.js';
import { HOOK_REGISTRY, getHook, buildHookEntry, interpolateCommand } from '../hooks/registry.js';
import { writeHooksSettings } from '../optimizer/hooks-installer.js';

export interface HooksOptions {
  path?: string;
  config?: string[];
  name?: string;
}

type SettingsJson = {
  hooks?: {
    [event: string]: Array<Record<string, unknown>>;
  };
  [key: string]: unknown;
};

/** Read current settings.local.json, returning {} if missing/invalid */
export function readInstalledHooks(projectRoot: string): SettingsJson {
  const settingsPath = path.join(projectRoot, '.claude', 'settings.local.json');
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as SettingsJson;
  } catch {
    return {};
  }
}

/** Remove all hook entries whose command contains the hook name */
export function removeHookByName(settings: SettingsJson, name: string): SettingsJson {
  const hooks = settings.hooks ?? {};
  const updated: SettingsJson['hooks'] = {};

  for (const [event, entries] of Object.entries(hooks)) {
    updated[event] = (entries as Array<Record<string, unknown>>).filter((entry) => {
      const hookItems = (entry.hooks as Array<{ command?: string }>) ?? [];
      return !hookItems.some((h) => h.command?.includes(`claudectx`) && entry.name === name);
    });
  }

  return { ...settings, hooks: updated };
}

/** Parse key=value pairs from --config option */
export function parseConfigPairs(pairs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

export async function hooksList(projectRoot: string): Promise<void> {
  const settings = readInstalledHooks(projectRoot);
  const installedCommands = JSON.stringify(settings.hooks ?? {});

  process.stdout.write('\n');
  process.stdout.write('claudectx hooks — available hooks\n');
  process.stdout.write('═'.repeat(55) + '\n');
  process.stdout.write(
    `  ${'Name'.padEnd(16)}  ${'Category'.padEnd(12)}  ${'Trigger'.padEnd(12)}  Status\n`,
  );
  process.stdout.write('─'.repeat(55) + '\n');

  for (const hook of HOOK_REGISTRY) {
    const installed = installedCommands.includes(hook.name) ? '✓ installed' : '  available';
    process.stdout.write(
      `  ${hook.name.padEnd(16)}  ${hook.category.padEnd(12)}  ${hook.triggerEvent.padEnd(12)}  ${installed}\n`,
    );
  }

  process.stdout.write('\n');
  process.stdout.write('  Use: claudectx hooks add <name> [--config key=value]\n\n');
}

export async function hooksAdd(
  name: string,
  projectRoot: string,
  configPairs: string[],
): Promise<void> {
  const def = getHook(name);
  if (!def) {
    process.stderr.write(
      `Error: unknown hook "${name}". Run "claudectx hooks list" to see available hooks.\n`,
    );
    process.exit(1);
  }

  const config = parseConfigPairs(configPairs);

  // Prompt for required fields not provided via --config
  const requiredMissing = Object.entries(def.configSchema).filter(
    ([key, field]) => field.required && config[key] === undefined,
  );

  if (requiredMissing.length > 0) {
    try {
      const { input } = await import('@inquirer/prompts');
      for (const [key, field] of requiredMissing) {
        const value = await input({ message: `${field.description} (${key}):` });
        config[key] = value;
      }
    } catch {
      // @inquirer/prompts not available — list what's missing
      process.stderr.write(
        `Error: required config fields missing: ${requiredMissing.map(([k]) => k).join(', ')}\n` +
          `  Use: claudectx hooks add ${name} --config ${requiredMissing.map(([k]) => `${k}=<value>`).join(' --config ')}\n`,
      );
      process.exit(1);
    }
  }

  // Apply defaults for optional missing fields
  for (const [key, field] of Object.entries(def.configSchema)) {
    if (config[key] === undefined && field.default !== undefined) {
      config[key] = String(field.default);
    }
  }

  // Verify the interpolated command has no unresolved placeholders
  const command = interpolateCommand(def.commandTemplate, config);
  if (command.includes('{{config.')) {
    process.stderr.write(`Error: unresolved config placeholders in command: ${command}\n`);
    process.exit(1);
  }

  // Build entry and merge into settings
  const entry = { ...buildHookEntry(def, config), name };
  const settings = readInstalledHooks(projectRoot);
  const hooksObj = settings.hooks ?? {};
  const eventList = (hooksObj[def.triggerEvent] as Array<Record<string, unknown>>) ?? [];

  // Avoid duplicate installation
  if (eventList.some((e) => e.name === name)) {
    process.stdout.write(`Hook "${name}" is already installed.\n`);
    return;
  }

  const updatedSettings: SettingsJson = {
    ...settings,
    hooks: { ...hooksObj, [def.triggerEvent]: [...eventList, entry] },
  };

  writeHooksSettings(projectRoot, updatedSettings);
  process.stdout.write(`\n  ✓ Hook "${name}" installed (${def.triggerEvent}${def.matcher ? ` / ${def.matcher}` : ''}).\n\n`);
}

export async function hooksRemove(name: string, projectRoot: string): Promise<void> {
  const settings = readInstalledHooks(projectRoot);
  const updated = removeHookByName(settings, name);
  writeHooksSettings(projectRoot, updated);
  process.stdout.write(`  ✓ Hook "${name}" removed.\n\n`);
}

export async function hooksStatus(projectRoot: string): Promise<void> {
  const settings = readInstalledHooks(projectRoot);
  const hooks = settings.hooks ?? {};
  const entries = Object.entries(hooks).flatMap(([event, arr]) =>
    (arr as Array<Record<string, unknown>>).map((e) => ({ event, ...e })),
  );

  if (entries.length === 0) {
    process.stdout.write('\n  No hooks installed. Run "claudectx hooks add <name>" to add one.\n\n');
    return;
  }

  process.stdout.write('\n  Installed hooks:\n');
  for (const entry of entries) {
    const name = (entry.name as string) ?? 'unnamed';
    const event = entry.event;
    const matcher = entry.matcher ? ` / ${entry.matcher}` : '';
    process.stdout.write(`    ${name.padEnd(18)} ${event}${matcher}\n`);
  }
  process.stdout.write('\n');
}

export async function hooksCommand(
  subcommand: string | undefined,
  options: HooksOptions & { name?: string },
): Promise<void> {
  const projectPath = options.path ? path.resolve(options.path) : process.cwd();
  const projectRoot = findProjectRoot(projectPath) ?? projectPath;

  const sub = subcommand ?? 'list';

  switch (sub) {
    case 'list':
      await hooksList(projectRoot);
      break;
    case 'add': {
      const name = options.name;
      if (!name) {
        process.stderr.write('Usage: claudectx hooks add <name> [--config key=value]\n');
        process.exit(1);
      }
      await hooksAdd(name, projectRoot, options.config ?? []);
      break;
    }
    case 'remove': {
      const name = options.name;
      if (!name) {
        process.stderr.write('Usage: claudectx hooks remove <name>\n');
        process.exit(1);
      }
      await hooksRemove(name, projectRoot);
      break;
    }
    case 'status':
      await hooksStatus(projectRoot);
      break;
    default:
      process.stderr.write(
        `Unknown sub-command "${sub}". Use: list | add <name> | remove <name> | status\n`,
      );
      process.exit(1);
  }
}
