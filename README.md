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
npm test          # 199 tests, should all pass
npm run lint      # 0 errors expected
```

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">
  <sub>Built by <a href="https://github.com/Horilla">Horilla</a> · If claudectx saved you money, a ⭐ helps more developers find it!</sub>
</div>
