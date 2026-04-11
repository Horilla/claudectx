import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { countTokens } from './tokenizer.js';
import { WASTE_THRESHOLDS, CACHE_BUSTERS } from '../shared/constants.js';
import type { WasteWarning, WasteCode } from '../shared/types.js';

export type AssistantId = 'claude' | 'cursor' | 'copilot' | 'windsurf';

export interface AssistantConfigFile {
  path: string;
  content: string;
  tokenCount: number;
}

export interface AssistantConfig {
  assistantId: AssistantId;
  configFiles: AssistantConfigFile[];
  totalTokens: number;
  warnings: WasteWarning[];
}

export interface AssistantDetectionResult {
  detected: AssistantId[];
  configs: Partial<Record<AssistantId, AssistantConfig>>;
}

/** Config file globs for each assistant (relative to project root) */
export const ASSISTANT_CONFIG_MAP: Record<AssistantId, string[]> = {
  claude: ['CLAUDE.md', '.claude/CLAUDE.md'],
  cursor: ['.cursorrules', '.cursor/rules/*.mdc', 'AGENTS.md'],
  copilot: ['.github/copilot-instructions.md', 'AGENTS.md'],
  windsurf: ['.windsurfrules'],
};

/**
 * Detect which AI assistants are configured in the project.
 */
export function detectAssistants(projectRoot: string): AssistantDetectionResult {
  const detected: AssistantId[] = [];
  const configs: Partial<Record<AssistantId, AssistantConfig>> = {};

  for (const [assistantId, patterns] of Object.entries(ASSISTANT_CONFIG_MAP) as Array<
    [AssistantId, string[]]
  >) {
    const configFiles: AssistantConfigFile[] = [];

    for (const pattern of patterns) {
      const isGlob = pattern.includes('*');
      if (isGlob) {
        try {
          const matches = glob.sync(pattern, { cwd: projectRoot, absolute: true, nodir: true });
          for (const filePath of matches) {
            const content = readFileSafe(filePath);
            if (content !== null) {
              configFiles.push({ path: filePath, content, tokenCount: countTokens(content) });
            }
          }
        } catch {
          // Skip invalid globs
        }
      } else {
        const absPath = path.join(projectRoot, pattern);
        const content = readFileSafe(absPath);
        if (content !== null) {
          configFiles.push({ path: absPath, content, tokenCount: countTokens(content) });
        }
      }
    }

    if (configFiles.length > 0) {
      detected.push(assistantId);
      const totalTokens = configFiles.reduce((sum, f) => sum + f.tokenCount, 0);
      const warnings = configFiles.flatMap((f) =>
        detectGenericWaste(f.content, f.path, f.tokenCount),
      );
      configs[assistantId] = { assistantId, configFiles, totalTokens, warnings };
    }
  }

  return { detected, configs };
}

/**
 * Analyze one assistant's config files in a project.
 */
export function analyzeAssistantConfig(
  assistantId: AssistantId,
  projectRoot: string,
): AssistantConfig {
  const result = detectAssistants(projectRoot);
  return (
    result.configs[assistantId] ?? {
      assistantId,
      configFiles: [],
      totalTokens: 0,
      warnings: [],
    }
  );
}

/**
 * Apply generic waste detection patterns to any instruction file content.
 * Reuses the same thresholds as CLAUDE.md analysis.
 */
export function detectGenericWaste(
  content: string,
  filePath: string,
  tokenCount: number,
): WasteWarning[] {
  const warnings: WasteWarning[] = [];
  const filename = path.basename(filePath);

  // Oversized
  if (tokenCount > WASTE_THRESHOLDS.MAX_CLAUDEMD_TOKENS) {
    warnings.push({
      code: 'OVERSIZED_CLAUDEMD' as WasteCode,
      severity: 'warning',
      message: `${filename} is ${tokenCount} tokens — exceeds ${WASTE_THRESHOLDS.MAX_CLAUDEMD_TOKENS} token threshold`,
      suggestion: 'Split into smaller, demand-loaded sections',
      estimatedSavings: tokenCount - WASTE_THRESHOLDS.MAX_CLAUDEMD_TOKENS,
    });
  }

  // Cache-busting dynamic content
  let cacheBustCount = 0;
  let lineNumber: number | undefined;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const { pattern } of CACHE_BUSTERS) {
      pattern.lastIndex = 0;
      if (pattern.test(lines[i])) {
        cacheBustCount++;
        lineNumber = lineNumber ?? i + 1;
        break;
      }
    }
  }
  if (cacheBustCount > 0) {
    warnings.push({
      code: 'CACHE_BUSTING_CONTENT' as WasteCode,
      severity: 'warning',
      message: `${filename} contains ${cacheBustCount} dynamic content pattern(s) that break prompt caching`,
      suggestion: 'Remove or comment out dates, timestamps, and version strings',
      estimatedSavings: 0,
      lineNumber,
    });
  }

  return warnings;
}

function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}
