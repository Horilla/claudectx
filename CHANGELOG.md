# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-04-11

### Added
- `claudectx compress` command — compresses session JSONL to a compact MEMORY.md entry
  - AI summarization via `claude-haiku-4-5-20251001` when `ANTHROPIC_API_KEY` is set
  - Heuristic fallback (no API key required)
  - `--prune --days N` to remove entries older than N days
  - `--auto` flag for non-interactive hook mode
  - Deduplication: skips sessions already in MEMORY.md
- `claudectx report` command — usage analytics for the last N days
  - Daily breakdown with bar charts
  - Cache hit rate, total cost, avg cost/session
  - Top 10 most-read files
  - Optimization tips based on actual usage patterns
  - `--json`, `--markdown`, `--days`, `--model` flags
- Session parser (`src/compressor/session-parser.ts`) — extracts turns, file ops, tool calls, and token usage from Claude Code JSONL files
- MEMORY.md writer (`src/compressor/memory-writer.ts`) — HTML-comment-marked entries, parse/append/prune support
- Usage aggregator (`src/reporter/usage-aggregator.ts`) — daily bucketing, cache hit rate, file stat aggregation

### Changed
- CI workflow now runs on `master`, `main`, and `develop` branches
- Release workflow syncs version from git tag before publishing

## [0.4.0] - 2026-04-11

### Added
- `claudectx mcp` command — smart MCP server for symbol-level file reading
  - `smart_read` tool: read a specific function/class/method by name or line range
  - `search_symbols` tool: find where a symbol is defined without reading files
  - `index_project` tool: build and rebuild the symbol index
  - Regex-based symbol extraction for TypeScript, JavaScript, and Python (no native deps)
  - 8K token cap on full-file reads with truncation message
  - `claudectx mcp --install` auto-writes `.claude/settings.json` entry

## [0.3.0] - 2026-04-11

### Added
- `claudectx watch` command — live Ink/React TUI dashboard
  - Real-time token burn rate, cache hit rate, session cost
  - Top files read table, sorted by frequency
  - Auto-refreshes every 2s + instant update on file reads (via `fs.watch`)
  - `q` to quit, `r` to refresh
  - `--log-stdin` hook mode: reads Claude Code hook JSON from stdin, appends to store
  - `--clear` to wipe the file-read log
- Cross-process JSONL store at `~/.claudectx/reads.jsonl` for file-read tracking

## [0.2.0] - 2026-04-11

### Added
- `claudectx optimize` command — interactive fix wizard
  - `.claudeignore` generator: detects project type (Node/Python/Rust/Go), writes sensible patterns
  - CLAUDE.md splitter: parses `##` sections, keeps core rules inline, moves reference docs to `.claude/`
  - Cache advisor: detects and comments out date strings, timestamps, and other cache-busting patterns
  - Hooks installer: installs `PostToolUse` hook in `.claude/settings.local.json`
  - `--apply`, `--dry-run`, `--claudemd`, `--ignorefile`, `--cache`, `--hooks` flags

## [0.1.0] - 2026-04-11

### Added
- `claudectx analyze` command — visual token breakdown per context component
- Token counting using js-tiktoken (cl100k_base, within 2-5% of Claude)
- Waste detection for 8 patterns: OVERSIZED_CLAUDEMD, MISSING_IGNOREFILE, CACHE_BUSTING_CONTENT, OVERSIZED_MEMORY, LARGE_REFERENCE_FILE, TOO_MANY_REFERENCES, REDUNDANT_CONTENT, NO_CACHING_CONFIGURED
- Cost estimation for claude-haiku-4-5, claude-sonnet-4-6, claude-opus-4-6
- `--json`, `--model`, `--watch`, `--path` flags for analyze command
- Project root auto-detection via CLAUDE.md / .claude/ directory walk
