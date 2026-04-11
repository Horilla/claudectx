// === Context Analysis ===

export interface ContextComponent {
  name: string;
  type:
    | 'system-prompt'
    | 'tool-definitions'
    | 'mcp-schemas'
    | 'claude-md'
    | 'memory'
    | 'reference-file';
  filePath?: string;
  tokenCount: number;
  estimatedCostPerRequest: number;
  warnings: WasteWarning[];
}

export interface WasteWarning {
  code: WasteCode;
  severity: 'info' | 'warning' | 'error';
  message: string;
  suggestion: string;
  estimatedSavings: number; // tokens
  lineNumber?: number;
}

export type WasteCode =
  | 'OVERSIZED_CLAUDEMD'
  | 'MISSING_IGNOREFILE'
  | 'CACHE_BUSTING_CONTENT'
  | 'OVERSIZED_MEMORY'
  | 'LARGE_REFERENCE_FILE'
  | 'TOO_MANY_REFERENCES'
  | 'REDUNDANT_CONTENT'
  | 'NO_CACHING_CONFIGURED'
  | 'DEAD_REFERENCE'
  | 'STALE_SECTION'
  | 'GIT_DELETED'
  | 'DEAD_INLINE_PATH';

export interface AnalysisReport {
  projectPath: string;
  timestamp: string;
  model: ClaudeModel;
  components: ContextComponent[];
  totalTokensPerRequest: number;
  estimatedCostPerSession: number; // 60 requests default
  warnings: WasteWarning[];
  optimizedTokensPerRequest: number; // if all warnings fixed
  potentialSavingsPercent: number;
}

// === Model Pricing ===

export type ClaudeModel = 'claude-haiku-4-5' | 'claude-sonnet-4-6' | 'claude-opus-4-6';

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
  contextWindow: number; // tokens
}

// === Session Data ===

export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  usage?: TokenUsage;
  timestamp: string;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  content?: string | ContentBlock[];
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface SessionSummary {
  sessionId: string;
  projectPath: string;
  startTime: string;
  endTime: string;
  model: ClaudeModel;
  totalUsage: TokenUsage;
  totalCostUsd: number;
  cacheHitRate: number;
  messageCount: number;
  filesRead: string[];
}

// === MCP Server ===

export interface SmartReadInput {
  file: string;
  symbol?: string;
  line_range?: { start: number; end: number };
  context_lines?: number;
}

export interface IndexQueryInput {
  query: string;
  type?: 'function' | 'class' | 'variable' | 'import' | 'all';
}

export interface SymbolResult {
  symbolName: string;
  symbolType: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  signature: string;
  docstring?: string;
}

// === Teams ===

export interface TeamIdentity {
  email?: string;
  hostname: string;
  anonymizedLabel?: string;
}

// === Hooks Marketplace ===

export interface InstalledHookMeta {
  name: string;
  installedAt: string;
  config: Record<string, string | number | boolean>;
}

// === Configuration ===

export interface ClaudeCtxConfig {
  defaultModel: ClaudeModel;
  anthropicApiKey?: string;
  maxMemoryTokens: number; // default: 3000
  maxClaudeMdTokens: number; // default: 2000
  sessionCostAlertThreshold?: number; // alert when session cost exceeds $ amount
  watchPollIntervalMs: number; // default: 2000
}
