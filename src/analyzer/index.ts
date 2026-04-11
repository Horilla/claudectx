import { parseContext } from './context-parser.js';
import { countTokens } from './tokenizer.js';
import {
  detectClaudeMdWarnings,
  detectMemoryWarnings,
  detectReferenceFileWarnings,
  detectMissingIgnoreFile,
  detectNoCachingConfigured,
  detectRedundantContent,
} from './waste-detector.js';
import { sessionCost, calculatePotentialSavings } from './cost-calculator.js';
import { calculateCost } from '../shared/models.js';
import { BUILTIN_OVERHEAD } from '../shared/constants.js';
import type { AnalysisReport, ContextComponent, ClaudeModel, WasteWarning } from '../shared/types.js';

export class ContextAnalyzer {
  constructor(private readonly model: ClaudeModel) {}

  async analyze(projectPath: string): Promise<AnalysisReport> {
    const ctx = parseContext(projectPath);
    const components: ContextComponent[] = [];
    const allWarnings: WasteWarning[] = [];

    // Built-in overhead (cannot be reduced)
    components.push({
      name: 'System prompt (built-in)',
      type: 'system-prompt',
      tokenCount: BUILTIN_OVERHEAD.SYSTEM_PROMPT,
      estimatedCostPerRequest: calculateCost(BUILTIN_OVERHEAD.SYSTEM_PROMPT, this.model),
      warnings: [],
    });

    components.push({
      name: 'Tool definitions (built-in)',
      type: 'tool-definitions',
      tokenCount: BUILTIN_OVERHEAD.TOOL_DEFINITIONS,
      estimatedCostPerRequest: calculateCost(BUILTIN_OVERHEAD.TOOL_DEFINITIONS, this.model),
      warnings: [],
    });

    // MCP schemas
    if (ctx.mcpToolCount > 0) {
      const mcpTokens = ctx.mcpToolCount * BUILTIN_OVERHEAD.MCP_PER_TOOL;
      components.push({
        name: `MCP schemas (${ctx.mcpToolCount} tools)`,
        type: 'mcp-schemas',
        tokenCount: mcpTokens,
        estimatedCostPerRequest: calculateCost(mcpTokens, this.model),
        warnings: [],
      });
    }

    // Project CLAUDE.md
    if (ctx.projectClaudeMd) {
      const tokenCount = countTokens(ctx.projectClaudeMd.content);
      const refCount = ctx.referencedFiles.length;
      const warnings = detectClaudeMdWarnings(ctx.projectClaudeMd.content, tokenCount, refCount);
      allWarnings.push(...warnings);
      components.push({
        name: 'CLAUDE.md (project)',
        type: 'claude-md',
        filePath: ctx.projectClaudeMd.filePath,
        tokenCount,
        estimatedCostPerRequest: calculateCost(tokenCount, this.model),
        warnings,
      });
    }

    // User CLAUDE.md
    if (ctx.userClaudeMd) {
      const tokenCount = countTokens(ctx.userClaudeMd.content);
      const warnings = detectClaudeMdWarnings(ctx.userClaudeMd.content, tokenCount, 0);
      allWarnings.push(...warnings);
      components.push({
        name: 'CLAUDE.md (user ~/.claude/)',
        type: 'claude-md',
        filePath: ctx.userClaudeMd.filePath,
        tokenCount,
        estimatedCostPerRequest: calculateCost(tokenCount, this.model),
        warnings,
      });
    }

    // MEMORY.md
    if (ctx.memoryMd) {
      const tokenCount = countTokens(ctx.memoryMd.content);
      const warnings = detectMemoryWarnings(ctx.memoryMd.content, tokenCount);
      allWarnings.push(...warnings);
      components.push({
        name: 'MEMORY.md',
        type: 'memory',
        filePath: ctx.memoryMd.filePath,
        tokenCount,
        estimatedCostPerRequest: calculateCost(tokenCount, this.model),
        warnings,
      });
    }

    // Referenced files
    for (const ref of ctx.referencedFiles) {
      const tokenCount = countTokens(ref.content);
      const warnings = detectReferenceFileWarnings(ref.filePath, ref.content, tokenCount);
      allWarnings.push(...warnings);
      components.push({
        name: `@${ref.referencedAs}`,
        type: 'reference-file',
        filePath: ref.filePath,
        tokenCount,
        estimatedCostPerRequest: calculateCost(tokenCount, this.model),
        warnings,
      });
    }

    // Project-level warnings
    const projectRoot = ctx.projectRoot ?? projectPath;
    const missingIgnore = detectMissingIgnoreFile(projectRoot);
    if (missingIgnore) allWarnings.push(missingIgnore);

    const noCache = detectNoCachingConfigured(
      projectRoot,
      ctx.projectClaudeMd?.content,
    );
    if (noCache) allWarnings.push(noCache);

    const redundant = detectRedundantContent(
      ctx.projectClaudeMd?.content ?? '',
      ctx.memoryMd?.content,
    );
    if (redundant) allWarnings.push(redundant);

    // Totals
    const totalTokensPerRequest = components.reduce((s, c) => s + c.tokenCount, 0);
    const totalSavableTokens = allWarnings.reduce((s, w) => s + w.estimatedSavings, 0);
    const costs = sessionCost(totalTokensPerRequest, this.model);
    const savings = calculatePotentialSavings(
      totalTokensPerRequest,
      totalSavableTokens,
      this.model,
    );

    return {
      projectPath,
      timestamp: new Date().toISOString(),
      model: this.model,
      components,
      totalTokensPerRequest,
      estimatedCostPerSession: costs.perSession,
      warnings: allWarnings,
      optimizedTokensPerRequest: totalTokensPerRequest - savings.savedTokens,
      potentialSavingsPercent: savings.savedPercent,
    };
  }
}
