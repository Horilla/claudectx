# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.2] - 2026-04-12

### Added
- **4-tier cost accuracy**: `calcCost` in `usage-aggregator.ts` and `team-aggregator.ts` now accounts for all four Anthropic pricing tiers — `input`, `output`, `cache_creation` (write), and `cache_read`. Previously write costs were silently ignored, causing underreported totals for sessions with heavy prompt caching.
- **Burn-rate projection**: `ReportData` gains `dailyAvgCostUsd` and `projectedMonthlyUsd` fields. Both `claudectx report` (text and markdown) now display **Daily avg cost** and **Projected (30-day)** so users can forecast spend before it surprises them.
- **Cache writes visible**: `report` output now shows `Cache writes` token count alongside `Cache reads`, giving a complete picture of caching costs.

### Changed
- **Streaming session reader**: `readSessionUsage` in `session-reader.ts` is now `async` and streams JSONL line-by-line via `readline` + `createReadStream`, avoiding loading multi-MB session files entirely into memory.
- `DayBucket` interface gains `cacheCreationTokens: number` field.
- `Dashboard.tsx` updated to handle `readSessionUsage` as a Promise.

## [1.1.1] - 2026-04-12

### Security
- **`warmup --cron`**: API key is no longer embedded in the crontab entry. The cron job now relies on `ANTHROPIC_API_KEY` being set in the cron environment. Cron expressions are validated before installation; the temp-file install pattern (`crontab <tmpfile>`) replaces the shell pipe to prevent injection.
- **`hooks add`**: `auto-compress` and `session-warmup` hooks no longer require an `apiKey` config field. Both hooks read `ANTHROPIC_API_KEY` from the environment at runtime — no secrets stored in `.claude/settings.local.json`. A warning is displayed whenever any sensitive-looking key (apiKey, token, secret, webhookUrl) is stored.
- **`hooks readInstalledHooks`**: Malformed `settings.local.json` now triggers a warning and auto-backup (`.json.bak`) instead of silently resetting all settings to `{}`.
- **`teams share`**: Destination path is now resolved through `fs.realpathSync` and rejected if it points inside a system directory (`/etc`, `/bin`, `/usr`, etc.), preventing symlink traversal attacks.

### Fixed
- **`drift --fix`**: Rewrites to CLAUDE.md are now atomic (write-to-temp → `fs.rename`) and create a `.bak` backup before any changes. On failure the original is restored.
- **`convert`**: Files that already exist at the target path now show an `[overwrite]` label in the output instead of being overwritten silently.
- **`src/index.ts`**: VERSION constant updated to `1.1.1` (was incorrectly pinned to `1.0.0`, causing `claudectx --version` to report the wrong version).

## [1.1.0] - 2026-04-12

### Added
- `claudectx budget <globs>` — estimate token cost before running a task
  - Resolves file globs, counts tokens per file, scores cache hit likelihood (high/medium/low)
  - Weighted cache hit potential (0–100%) based on recent reads.jsonl history
  - `.claudeignore` recommendations for large files not yet excluded
  - `--threshold N`, `--model`, `--json` flags
- `claudectx warmup` — pre-warm the Anthropic prompt cache with CLAUDE.md
  - Sends a silent priming request so the first real working request gets a cache hit
  - Calculates write cost, savings per hit, and break-even request count
  - `--ttl 5|60` (60-min extended TTL at 2× write cost), `--cron <expr>` to install as cron job
  - Injectable Anthropic client for testability
- `claudectx drift` — detect stale references and dead sections in CLAUDE.md
  - Dead `@file` references that no longer exist on disk
  - File paths mentioned in git-deleted files (via `git log --diff-filter=D`)
  - `## Sections` with zero matching file reads in the last N days
  - Dead inline paths in prose (src/old/file.py that no longer exist)
  - `--fix` flag: interactive checkbox to remove flagged lines, rewrites CLAUDE.md
  - `--days N`, `--json` flags; degrades gracefully in non-git directories
- `claudectx hooks list|add|remove|status` — hook marketplace
  - 4 built-in hooks: `auto-compress`, `daily-budget`, `slack-digest`, `session-warmup`
  - `{{config.key}}` interpolation for per-install configuration
  - `--config key=value` pairs for non-interactive installs
  - Interactive prompts for required config fields not provided via `--config`
  - Hooks written to `.claude/settings.json` alongside existing entries
- `claudectx convert --to cursor|copilot|windsurf` — translate CLAUDE.md to other AI assistant formats
  - Cursor: splits `##` sections into `.cursor/rules/<slug>.mdc` with YAML frontmatter (`alwaysApply: true`)
  - Copilot: strips `@file` references, writes to `.github/copilot-instructions.md`
  - Windsurf: same cleanup, writes to `.windsurfrules`
  - `--dry-run` flag to preview without writing
- `claudectx teams export|aggregate|share` — multi-developer cost attribution
  - `export`: generates `~/.claudectx/team-export-{date}.json` from local session data
  - `aggregate --dir ./reports/`: merges multiple exports into a team cost table
  - `share --to <path>`: copies latest export to a shared location
  - `--anonymize`: replaces identities with "Dev 1", "Dev 2", etc.
  - Developer identity: `git config user.email` with `os.hostname()` fallback

### Changed
- `src/shared/types.ts`: extended `WasteCode` union with `DEAD_REFERENCE`, `STALE_SECTION`, `GIT_DELETED`, `DEAD_INLINE_PATH`; added `TeamIdentity` and `InstalledHookMeta` interfaces
- `src/optimizer/hooks-installer.ts`: exported `writeHooksSettings()` for use by the hooks marketplace
- Test suite: 199 → 278 tests (79 new tests across 7 new test files)

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
