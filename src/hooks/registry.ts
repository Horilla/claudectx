export type TriggerEvent = 'PreToolUse' | 'PostToolUse' | 'Stop' | 'Notification';

export interface HookConfigField {
  type: 'string' | 'number' | 'boolean';
  default?: string | number | boolean;
  description: string;
  required?: boolean;
}

export interface HookDefinition {
  name: string;
  description: string;
  triggerEvent: TriggerEvent;
  matcher?: string;
  commandTemplate: string;
  configSchema: Record<string, HookConfigField>;
  category: 'compression' | 'budget' | 'notification' | 'warmup';
}

export const HOOK_REGISTRY: HookDefinition[] = [
  {
    name: 'auto-compress',
    description: 'Compress session when token count exceeds threshold',
    triggerEvent: 'PostToolUse',
    matcher: 'Read',
    commandTemplate: 'claudectx compress --auto --api-key {{config.apiKey}}',
    configSchema: {
      threshold: { type: 'number', default: 50000, description: 'Token threshold to trigger compression' },
      apiKey: { type: 'string', description: 'Anthropic API key for AI summarization', required: true },
    },
    category: 'compression',
  },
  {
    name: 'daily-budget',
    description: 'Warn when daily spend exceeds a dollar limit',
    triggerEvent: 'PreToolUse',
    commandTemplate: 'claudectx report --days 1 --json',
    configSchema: {
      dailyLimit: { type: 'number', default: 5, description: 'Daily spend limit in USD' },
    },
    category: 'budget',
  },
  {
    name: 'slack-digest',
    description: 'POST daily usage summary to a Slack incoming webhook',
    triggerEvent: 'Stop',
    commandTemplate:
      'claudectx report --json | curl -s -X POST -H "Content-Type: application/json" --data-binary @- {{config.webhookUrl}}',
    configSchema: {
      webhookUrl: {
        type: 'string',
        description: 'Slack Incoming Webhook URL',
        required: true,
      },
    },
    category: 'notification',
  },
  {
    name: 'session-warmup',
    description: 'Pre-warm the Anthropic prompt cache on each session start',
    triggerEvent: 'PostToolUse',
    matcher: 'Read',
    commandTemplate: 'claudectx warmup --api-key {{config.apiKey}}',
    configSchema: {
      apiKey: { type: 'string', description: 'Anthropic API key', required: true },
    },
    category: 'warmup',
  },
];

/**
 * Look up a hook by name. Returns undefined if not found.
 */
export function getHook(name: string): HookDefinition | undefined {
  return HOOK_REGISTRY.find((h) => h.name === name);
}

/**
 * Interpolate {{config.key}} placeholders in a command template.
 */
export function interpolateCommand(
  template: string,
  config: Record<string, string | number | boolean>,
): string {
  return template.replace(/\{\{config\.(\w+)\}\}/g, (_, key) => {
    const val = config[key];
    return val !== undefined ? String(val) : `{{config.${key}}}`;
  });
}

/**
 * Build the hook entry object that goes inside .claude/settings.local.json hooks array.
 */
export function buildHookEntry(
  def: HookDefinition,
  config: Record<string, string | number | boolean>,
): Record<string, unknown> {
  const command = interpolateCommand(def.commandTemplate, config);
  const hookItem: Record<string, unknown> = {
    type: 'command',
    command,
  };

  const entry: Record<string, unknown> = { hooks: [hookItem] };
  if (def.matcher) {
    entry.matcher = def.matcher;
  }

  return entry;
}
