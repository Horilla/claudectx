<div align="center">
  <h1>claudectx</h1>
  <p><strong>Reduce Claude Code token usage by up to 80% — with zero workflow changes.</strong></p>

  <a href="https://npmjs.com/package/claudectx"><img src="https://img.shields.io/npm/v/claudectx.svg?style=flat-square" alt="npm version" /></a>
  <a href="https://github.com/Horilla/claudectx/stargazers"><img src="https://img.shields.io/github/stars/Horilla/claudectx?style=flat-square" alt="GitHub Stars" /></a>
  <img src="https://img.shields.io/npm/dm/claudectx.svg?style=flat-square" alt="npm downloads" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="MIT License" /></a>
  <a href="https://github.com/Horilla/claudectx/actions"><img src="https://img.shields.io/github/actions/workflow/status/Horilla/claudectx/ci.yml?style=flat-square" alt="CI" /></a>
</div>

<br />

<div align="center">
  <img src="docs/demo.gif" alt="claudectx demo" width="700" />
</div>

---

## Why claudectx?

A typical Claude Code session costs **$2–$15 in tokens**. Most of it is wasted:

| Problem | Impact | Fix |
|---|---|---|
| Bloated `CLAUDE.md` injected every request | 6,000–14,000 extra tokens/request | `claudectx optimize --claudemd` |
| No `.claudeignore` — reads `node_modules/` | 40–60% of search tokens wasted | `claudectx optimize --ignorefile` |
| Full file reads for small questions | 70% overhead from unnecessary lines | `claudectx mcp` |
| No prompt caching configured | Paying 10× for static context | `claudectx optimize --cache` |
| No cross-session memory | Repeating the same context every session | `claudectx compress` |
| Dead `@refs` and stale sections in CLAUDE.md | Silent token waste on every request | `claudectx drift` |
| Unknown cost before running a big task | Surprise bills after the fact | `claudectx budget` |
| Cache cold at session start | First request always a full miss | `claudectx warmup` |
| No visibility into team-wide spend | Can't attribute cost across devs | `claudectx teams` |

### Where your tokens actually go

| Component | Typical Tokens | % of Total | Fixable? |
|---|---|---|---|
| Claude Code system prompt | 4,200 | 14% | No |
| Tool definitions (built-in) | 2,100 | 7% | No |
| MCP tool schemas | 1,980 | 7% | Partially |
| **CLAUDE.md** | **6,800–14,000** | **22–46%** | **YES — biggest win** |
| MEMORY.md / memory files | 3,300 | 11% | YES |
| Conversation history (grows) | 2,000–40,000 | 7–57% | YES |

---

## Quick Start

```bash
# No install needed — try it immediately
npx claudectx analyze

# Fix everything automatically
npx claudectx optimize --apply

# See what's happening in real time while Claude is coding
claudectx watch

# After your session: compress it into a tiny MEMORY.md entry
claudectx compress

# Review your token spend for the last 7 days
claudectx report

# --- v1.1.0 additions ---

# Know the cost before you start a task
claudectx budget "src/**/*.ts" "tests/**/*.ts"

# Pre-warm your prompt cache so the first request is free
claudectx warmup --api-key $ANTHROPIC_API_KEY

# Find dead references and stale sections in CLAUDE.md
claudectx drift

# Convert CLAUDE.md to Cursor / Copilot / Windsurf format
claudectx convert --to cursor

# Export your usage data for team-wide cost attribution
claudectx teams export
```

## Installation

```bash
npm install -g claudectx
```

---

## Commands

### `claudectx analyze` — See exactly where your tokens go

```
╔══════════════════════════════════════════════════════════════╗
║               claudectx — Context Analysis                   ║
║               Project: /Users/you/my-project                 ║
╠══════════════════════════════════════════════════════════════╣
║  Tokens per request: 18,432    Est. session cost: $1.84      ║
║  Model: claude-sonnet-4-6      Context used: 1.8% of 1M     ║
╠═══════════════════════════════╦══════════╦═══════╦══════════╣
║ Component                     ║  Tokens  ║  Cost ║  Status  ║
╠═══════════════════════════════╬══════════╬═══════╬══════════╣
║ System prompt (built-in)      ║   4,200  ║ $0.01 ║    ✓     ║
║ Tool definitions (built-in)   ║   2,100  ║ $0.01 ║    ✓     ║
║ CLAUDE.md (./CLAUDE.md)       ║   7,841  ║ $0.02 ║    ⚠     ║
║ MEMORY.md                     ║   2,551  ║ $0.01 ║    ✓     ║
╠═══════════════════════════════╬══════════╬═══════╬══════════╣
║ TOTAL (per request)           ║  18,432  ║ $0.06 ║          ║
╚═══════════════════════════════╩══════════╩═══════╩══════════╝

⚠  3 optimization opportunities found:

  [1] CLAUDE.md is 7,841 tokens — 292% over the 2,000 token recommendation
      → Run `claudectx optimize --claudemd` to split into demand-loaded files
      → Potential savings: ~5,841 tokens/request (~$3.51/hour at 60 req/hr)

  [2] No .claudeignore file found
      → Run `claudectx optimize --ignorefile` to generate one

  [3] CLAUDE.md contains dynamic timestamp on line 3
      → Breaks prompt caching — run `claudectx optimize --cache` to fix
```

```bash
claudectx analyze                        # Analyze current directory
claudectx analyze --path /path/to/proj  # Analyze specific path
claudectx analyze --json                 # Raw JSON output
claudectx analyze --model sonnet         # Calculate for specific model
claudectx analyze --watch                # Re-run on file changes
```

---

### `claudectx optimize` — Auto-fix token waste

```bash
claudectx optimize                    # Interactive — confirm each change
claudectx optimize --apply            # Apply all fixes without prompting
claudectx optimize --dry-run          # Preview changes without applying
claudectx optimize --claudemd         # Only optimize CLAUDE.md
claudectx optimize --ignorefile       # Only generate .claudeignore
claudectx optimize --cache            # Only fix cache-busting content
claudectx optimize --hooks            # Only install session hooks
```

What it does:

- **CLAUDE.md splitter** — Parses your CLAUDE.md by `##` sections, keeps core rules inline (<2K tokens), moves reference docs to `.claude/` loaded on demand with `@file` references.
- **.claudeignore generator** — Detects your project type (Node, Python, Rust, Go) and generates a `.claudeignore` with sensible defaults.
- **Cache advisor** — Finds date strings, timestamps, and other patterns that break prompt caching and comments them out.
- **Hooks installer** — Installs a `PostToolUse` hook in `.claude/settings.local.json` so `claudectx watch` can track files in real time.

---

### `claudectx watch` — Live token dashboard

Real-time terminal UI showing token burn rate, cache hit rate, and most-read files while Claude Code is running.

```bash
claudectx watch                    # Launch dashboard
claudectx watch --session <id>     # Watch a specific session
claudectx watch --clear            # Clear the read log and exit
```

The dashboard auto-refreshes every 2 seconds and updates instantly when a new file is read (requires hooks from `claudectx optimize --hooks`).

---

### `claudectx mcp` — Smart MCP server

An MCP server that lets Claude read just one function or class from a file instead of the whole thing — **up to 97% fewer tokens per read**.

```bash
claudectx mcp                  # Start MCP server (stdio)
claudectx mcp --install        # Auto-add to .claude/settings.json
```

**Tools provided to Claude:**
- **`smart_read`** — Read a specific symbol (function, class, method) by name, or a line range
- **`search_symbols`** — Find where a symbol is defined without reading any files
- **`index_project`** — Build the symbol index for the current project

Configure manually in `.claude/settings.json`:

```json
{
  "mcpServers": {
    "claudectx": {
      "command": "claudectx",
      "args": ["mcp"],
      "type": "stdio"
    }
  }
}
```

---

### `claudectx compress` — Session memory compression

Compress the full session JSONL into a compact MEMORY.md entry at the end of your session. Uses `claude-haiku` if `ANTHROPIC_API_KEY` is set, otherwise falls back to a structured heuristic summary.

```bash
claudectx compress                        # Compress most recent session
claudectx compress --session <id>         # Compress specific session
claudectx compress --auto                 # Non-interactive (for hooks)
claudectx compress --prune --days 30      # Also prune entries older than 30 days
claudectx compress --api-key <key>        # Provide API key explicitly
```

A typical 8,000-token session compresses to ~180 tokens — **97.8% reduction**.

---

### `claudectx report` — Usage analytics

```bash
claudectx report                # Last 7 days (plain text)
claudectx report --days 30      # Last 30 days
claudectx report --json         # JSON output
claudectx report --markdown     # Markdown output
claudectx report --model opus   # Cost estimate for a different model
```

```
claudectx report — 7-day summary (2026-04-04 → 2026-04-11)
══════════════════════════════════════════════════════════════════════

TOTALS
────────────────────────────
  Sessions:              23
  Requests:              847
  Input tokens:          2,341,200
  Output tokens:         318,400
  Cache reads:           1,204,000  (51% hit rate)
  Total cost (est.):     $4.87
  Avg cost/session:      $0.21
  Avg tokens/request:    2,766

DAILY USAGE
────────────────────────────
  2026-04-11  ████████████████░░  412K in  $1.02  (5 sess)
  2026-04-10  █████████░░░░░░░░░  234K in  $0.58  (4 sess)
  ...
```

---

### `claudectx budget` — Know the cost before you start

Before running a big task, see exactly which files will be read, how many tokens they'll consume, and what it'll cost.

```bash
claudectx budget "src/**/*.ts"                        # Estimate all TypeScript files
claudectx budget "**/*.py" --threshold 20000          # Warn if total exceeds 20K tokens
claudectx budget "src/**" --model opus --json         # JSON output for scripting
```

Output shows per-file token counts, cache hit likelihood (based on your recent reads), total cost estimate, and `.claudeignore` recommendations for files that are large but rarely useful.

---

### `claudectx warmup` — Pre-warm the prompt cache

Start each session with a cache hit instead of a full miss. Sends a silent priming request to Anthropic so your CLAUDE.md is cached before Claude Code touches it.

```bash
claudectx warmup --api-key $ANTHROPIC_API_KEY          # 5-min cache TTL (default)
claudectx warmup --ttl 60 --api-key $ANTHROPIC_API_KEY # 60-min extended TTL (2× write cost)
claudectx warmup --model sonnet --api-key $ANTHROPIC_API_KEY  # use a specific model
claudectx warmup --cron "0 9 * * 1-5"                 # Install as weekday 9am cron job
claudectx warmup --json                                # JSON output for scripting
```

Reports tokens warmed, write cost, savings per cache hit, and break-even request count.

> **Note on `--cron`:** The API key is **not** embedded in the cron job. At runtime, the job reads `ANTHROPIC_API_KEY` from your environment. Set it in `~/.profile` or `~/.zshenv` so cron can see it.

---

### `claudectx drift` — CLAUDE.md stays fresh, not stale

Over time CLAUDE.md accumulates dead references and sections nobody reads. `drift` finds them.

```bash
claudectx drift                      # Scan current project
claudectx drift --days 14            # Use 14-day read window (default: 30)
claudectx drift --fix                # Interactively remove flagged lines (creates CLAUDE.md.bak first)
claudectx drift --json               # JSON output
claudectx drift --path /other/proj  # Scan a different project directory
```

Detects 4 types of drift:

| Type | Example |
|---|---|
| **Dead `@ref`** | `@src/old-service.ts` — file deleted |
| **Git-deleted mention** | `legacy-auth.py` appears in prose but was removed in git |
| **Stale section** | `## Android Setup` — zero reads in 30 days |
| **Dead inline path** | `src/utils/helper.py` mentioned in text, no longer exists |

---

### `claudectx hooks` — Hook marketplace

Install named, pre-configured hooks beyond the basic read logger.

```bash
claudectx hooks list                                        # Show all available hooks
claudectx hooks add auto-compress                           # Install with default threshold (50k tokens)
claudectx hooks add auto-compress --config threshold=30000  # Custom token threshold
claudectx hooks add slack-digest --config webhookUrl=https://hooks.slack.com/...
claudectx hooks remove slack-digest                         # Remove an installed hook
claudectx hooks status                                      # Show what's installed
```

**Built-in hooks:**

| Hook | Trigger | Config | What it does |
|---|---|---|---|
| `auto-compress` | PostToolUse (Read) | `threshold` (default: 50000) | Runs `claudectx compress` after each session |
| `daily-budget` | PreToolUse | _(none)_ | Reports today's spend before each tool call |
| `slack-digest` | Stop | `webhookUrl` (required) | Posts session report to a Slack webhook |
| `session-warmup` | PostToolUse (Read) | _(none)_ | Re-warms the cache; reads `ANTHROPIC_API_KEY` from env |

> **Security note:** Hooks that need an API key (`compress`, `warmup`) read `ANTHROPIC_API_KEY` from your environment — no secrets are stored in `.claude/settings.local.json`.

---

### `claudectx convert` — Use your CLAUDE.md everywhere

You wrote great instructions for Claude. Use them with Cursor, Copilot, or Windsurf too.

```bash
claudectx convert --to cursor         # → .cursor/rules/<section>.mdc (one per ## section)
claudectx convert --to copilot        # → .github/copilot-instructions.md
claudectx convert --to windsurf       # → .windsurfrules
claudectx convert --to cursor --dry-run  # Preview without writing
```

Each `##` section in CLAUDE.md becomes a separate Cursor `.mdc` file with `alwaysApply: true` frontmatter. `@file` references are stripped for assistants that don't support them.

---

### `claudectx teams` — Multi-developer cost attribution

See where the money goes across your whole team — without sharing session content.

```bash
# Step 1: each developer runs this on their own machine
claudectx teams export                           # Default: last 30 days, sonnet pricing
claudectx teams export --days 7 --model haiku   # Custom window and model

# Step 2: collect the JSON files in a shared directory, then aggregate
claudectx teams aggregate --dir ./reports/
claudectx teams aggregate --dir ./reports/ --anonymize  # Replace names with Dev 1, Dev 2...
claudectx teams aggregate --dir ./reports/ --json       # Machine-readable JSON

# Optional: copy your export to a shared location
claudectx teams share --to /shared/reports/
```

Output shows per-developer spend, cache hit rate, avg request size, and top shared files. Exports are lightweight JSON — no session content, no prompts, just aggregated token counts.

---

## How it all fits together

```
Before claudectx:                    After claudectx:
─────────────────────────────        ─────────────────────────────
Every request:                       Every request:
  CLAUDE.md: 12,400 tokens     →       CLAUDE.md core: 1,800 tokens
  No caching: pay full price   →       Cache hit rate: 70%+
  Full file reads every time   →       smart_read: symbol-level only

End of session:                      End of session:
  Session forgotten            →       claudectx compress → 187 tokens
  Start from scratch next time →       MEMORY.md carries key context forward
```

---

## Token Savings — Share Your Results

Join the **[Token Savings Hall of Fame](https://github.com/Horilla/claudectx/discussions)** — share your before/after numbers.

---

## Contributing

PRs welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

```bash
git clone https://github.com/Horilla/claudectx.git
cd claudectx
npm install
npm run build
npm test          # 278 tests, should all pass
npm run lint      # 0 errors expected
```

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">
  <sub>Built by <a href="https://github.com/Horilla">Horilla</a> · If claudectx saved you money, a ⭐ helps more developers find it!</sub>
</div>
