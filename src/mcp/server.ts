/**
 * claudectx MCP server — provides symbol-level file reading to Claude Code.
 *
 * Tools:
 *   smart_read      — read a named symbol (function/class) or line range from a file
 *   search_symbols  — full-text search for symbols across the indexed codebase
 *   index_project   — (re)build the symbol index for a given project root
 */
import * as path from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { smartRead } from './smart-reader.js';
import { globalIndex } from './symbol-index.js';

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'smart_read',
    description:
      'Read a specific symbol (function, class, interface) or line range from a file ' +
      'instead of the whole file. Saves 60-90% of tokens on large files. ' +
      'Falls back to full file if symbol is not found (capped at 8K tokens).',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Absolute or relative path to the file to read.',
        },
        symbol: {
          type: 'string',
          description:
            'Name of the function, class, interface, or type to extract. ' +
            'If provided, only that symbol block is returned.',
        },
        start_line: {
          type: 'number',
          description: 'Start line (1-based, inclusive). Use with end_line.',
        },
        end_line: {
          type: 'number',
          description: 'End line (1-based, inclusive). Use with start_line.',
        },
        context_lines: {
          type: 'number',
          description: 'Extra lines of context above/below line range (default 3).',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'search_symbols',
    description:
      'Search for functions, classes, variables, and interfaces by name across the ' +
      'indexed codebase. Returns file paths and line numbers. ' +
      'Run index_project first to populate the index.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Symbol name to search for (substring match, case-insensitive).',
        },
        type: {
          type: 'string',
          enum: ['function', 'class', 'interface', 'type', 'variable', 'all'],
          description: 'Filter by symbol type (default: all).',
        },
        path_filter: {
          type: 'string',
          description: 'Only include results from files whose path contains this string.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default 20).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'index_project',
    description:
      'Build or rebuild the symbol index for a project directory. ' +
      'Required before using search_symbols. Takes a few seconds for large projects.',
    inputSchema: {
      type: 'object',
      properties: {
        project_root: {
          type: 'string',
          description: 'Absolute path to the project root (default: cwd).',
        },
        rebuild: {
          type: 'boolean',
          description: 'Force a full rebuild even if the index is already built.',
        },
      },
      required: [],
    },
  },
];

// ─── Tool handlers ────────────────────────────────────────────────────────────

interface SmartReadArgs {
  file: string;
  symbol?: string;
  start_line?: number;
  end_line?: number;
  context_lines?: number;
}

interface SearchSymbolsArgs {
  query: string;
  type?: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'all';
  path_filter?: string;
  limit?: number;
}

interface IndexProjectArgs {
  project_root?: string;
  rebuild?: boolean;
}

function handleSmartRead(args: SmartReadArgs): string {
  const filePath = path.resolve(args.file);
  const result = smartRead(
    filePath,
    args.symbol,
    args.start_line,
    args.end_line,
    args.context_lines ?? 3
  );

  const header = [
    `// File: ${result.filePath}`,
    result.symbolName ? `// Symbol: ${result.symbolName} (lines ${result.startLine}–${result.endLine})` : `// Lines: ${result.startLine}–${result.endLine} of ${result.totalLines}`,
    `// Tokens: ${result.tokenCount}${result.truncated ? ' (truncated — file is large)' : ''}`,
    '',
  ].join('\n');

  return header + result.content;
}

async function handleSearchSymbols(args: SearchSymbolsArgs): Promise<string> {
  if (!globalIndex.isReady) {
    return (
      'Index not built yet. Call index_project first.\n' +
      `Example: index_project({ "project_root": "${process.cwd()}" })`
    );
  }

  const results = globalIndex.search(
    args.query,
    args.type ?? 'all',
    args.path_filter,
    args.limit ?? 20
  );

  if (results.length === 0) {
    return `No symbols found matching "${args.query}".`;
  }

  const lines = [
    `Found ${results.length} symbol(s) matching "${args.query}":`,
    '',
  ];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const rel = path.relative(process.cwd(), r.filePath);
    lines.push(`${i + 1}. [${r.type}] ${r.name}`);
    lines.push(`   ${rel}:${r.lineStart}`);
    lines.push(`   ${r.signature.trim()}`);
    lines.push('');
  }

  lines.push(
    `Tip: Use smart_read({ "file": "<path>", "symbol": "<name>" }) to read a specific symbol.`
  );

  return lines.join('\n');
}

async function handleIndexProject(args: IndexProjectArgs): Promise<string> {
  const projectRoot = args.project_root ? path.resolve(args.project_root) : process.cwd();

  const fn = args.rebuild
    ? () => globalIndex.rebuild(projectRoot)
    : () => globalIndex.build(projectRoot);

  const { fileCount, symbolCount } = await fn();

  if (fileCount === 0 && globalIndex.isReady) {
    return `Index already built: ${globalIndex.size} symbols. Pass rebuild: true to force re-index.`;
  }

  return (
    `Index built for: ${projectRoot}\n` +
    `Files scanned: ${fileCount}\n` +
    `Symbols indexed: ${symbolCount}\n\n` +
    `Use search_symbols({ "query": "<name>" }) to find symbols.`
  );
}

// ─── Server bootstrap ─────────────────────────────────────────────────────────

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'claudectx', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let text: string;

      switch (name) {
        case 'smart_read':
          text = handleSmartRead(args as SmartReadArgs);
          break;
        case 'search_symbols':
          text = await handleSearchSymbols(args as SearchSymbolsArgs);
          break;
        case 'index_project':
          text = await handleIndexProject(args as IndexProjectArgs);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return { content: [{ type: 'text', text }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't pollute the MCP stdio protocol
  process.stderr.write('[claudectx mcp] Server started (stdio)\n');
}
