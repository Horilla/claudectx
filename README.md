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

> **Note:** Live dashboard GIF coming in v0.3.0. Try `npx claudectx analyze` now — no API key needed.

---

## Why claudectx?

A typical Claude Code session costs **$2–$15 in tokens**. Most of it is wasted.

| Problem | Impact | Fix |
|---|---|---|
| Bloated `CLAUDE.md` injected every request | 6,000–14,000 extra tokens/request | `claudectx optimize --claudemd` |
| No `.claudeignore` — reads `node_modules/` | 40–60% of search tokens wasted | `claudectx optimize --ignorefile` |
| Full file reads for small questions | 70% overhead from unnecessary lines | `claudectx mcp` (smart_read tool) |
| No prompt caching configured | Paying 10x for static context | `claudectx optimize --cache` |
| No cross-session memory | Repeating same context every session | `claudectx compress` |

### Token cost breakdown — typical developer project

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
# Analyze token usage in your current project (no API key needed)
npx claudectx analyze

# Fix everything automatically
npx claudectx optimize --apply

# Live dashboard while coding (coming in v0.3.0)
npx claudectx watch
```

## Installation

```bash
npm install -g claudectx
```

---

## Features

### `claudectx analyze` — See exactly where your tokens go

```
╔══════════════════════════════════════════════════════════════╗
║               claudectx — Context Analysis                   ║
║               Project: /Users/you/my-project                 ║
╠══════════════════════════════════════════════════════════════╣
║  Tokens per request: 18,432    Est. session cost: $1.84      ║
║  Model: claude-sonnet-4.6      Context used: 1.8% of 1M     ║
╠═══════════════════════════════╦══════════╦═══════╦══════════╣
║ Component                     ║  Tokens  ║  Cost ║  Status  ║
╠═══════════════════════════════╬══════════╬═══════╬══════════╣
║ System prompt (built-in)      ║   4,200  ║ $0.01 ║    ✓     ║
║ Tool definitions (built-in)   ║   2,100  ║ $0.01 ║    ✓     ║
║ MCP schemas (3 tools)         ║     540  ║ $0.00 ║    ✓     ║
║ CLAUDE.md (./CLAUDE.md)       ║   7,841  ║ $0.02 ║    ⚠     ║
║ User CLAUDE.md (~/.claude/)   ║   1,200  ║ $0.00 ║    ✓     ║
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
      → Breaks prompt caching — removing saves ~88% on static context
```

**Options:**
```bash
claudectx analyze                        # Analyze current directory
claudectx analyze --path /path/to/proj  # Analyze specific path
claudectx analyze --json                 # Raw JSON output (for scripting)
claudectx analyze --model sonnet         # Calculate for specific model
claudectx analyze --watch                # Re-run on file changes
```

---

### `claudectx optimize` — Auto-fix token waste

```bash
claudectx optimize                    # Interactive mode — confirm each change
claudectx optimize --apply            # Apply all fixes without prompting
claudectx optimize --dry-run          # Preview changes without applying
claudectx optimize --claudemd         # Only optimize CLAUDE.md
claudectx optimize --ignorefile       # Only generate .claudeignore
claudectx optimize --cache            # Only apply caching recommendations
claudectx optimize --hooks            # Only install session hooks
```

**What it fixes:**
- **CLAUDE.md splitter** — Parses your CLAUDE.md by sections, keeps core rules inline, moves reference docs to `docs/ai-context/` loaded on demand. Target: under 2,000 tokens.
- **.claudeignore generator** — Generates a `.claudeignore` inheriting from `.gitignore` plus Claude-specific patterns (`node_modules/`, `dist/`, lock files, `*.map`, migrations).
- **Cache advisor** — Detects date strings, env var references, and other patterns that break prompt caching. Tells you exactly which lines to fix.
- **Hooks installer** — Installs Stop and PostToolUse hooks in `.claude/settings.json` for session compression and file read tracking.

---

### `claudectx watch` — Live token dashboard *(v0.3.0)*

Real-time terminal dashboard showing token burn rate, cache hit rate, and cost while Claude Code is running.

```
╔══════════════════════ claudectx watch ═══════════════════════╗
║                                                              ║
║  Context Window  [████████████░░░░░░░░░░░░░░] 42% (42K/1M) ║
║                                                              ║
╠═══════════════════════╦══════════════════════════════════════╣
║  Session Cost         ║  Cache Performance                   ║
║  Input:   $0.84       ║  Hit Rate:  [████████░░] 78%        ║
║  Output:  $0.23       ║  Hits:  47  Misses: 13              ║
║  Total:   $1.07       ║  Savings: $2.34 so far              ║
╠═══════════════════════╩══════════════════════════════════════╣
║  Top Token Consumers This Session                            ║
║  1. CLAUDE.md              7,841 tokens  (injected 60x)     ║
║  2. src/app/route.ts       4,200 tokens  (read 3x)          ║
╚══════════════════════════════════════════════════════════════╝
```

---

### `claudectx mcp` — Smart MCP server *(v0.4.0)*

An MCP server that replaces Claude Code's full file reads with symbol-level reads — **97% fewer tokens per read**.

```bash
claudectx mcp                  # Start MCP server (stdio)
claudectx mcp --install        # Auto-add to .claude/settings.json
```

**MCP tools provided:**
- **`smart_read`** — Read just one function/class/symbol from a file instead of the whole file
- **`index_query`** — Answer "where is X defined?" without reading files at all
- **`diff_read`** — Get only the lines that changed since your session started

---

### `claudectx compress` — Session memory compression *(v0.5.0)*

At session end, compress the full conversation into a minimal MEMORY.md entry.

```bash
claudectx compress              # Compress most recent session
claudectx compress --auto       # Non-interactive (for hooks)
claudectx compress --prune --days 30  # Also prune old entries
```

**Result:** 8,420-token session → 187-token memory entry (97.8% reduction)

---

### `claudectx report` — Usage analytics *(v0.5.0)*

```bash
claudectx report                # Last 7 days
claudectx report --days 30      # Last 30 days
claudectx report --json         # JSON output
claudectx report --markdown     # Save as markdown
```

Shows: total cost, daily breakdown, cache hit rate, most expensive sessions, top files read, and personalized recommendations.

---

## Token Savings — Share Your Results

Join the **[Token Savings Hall of Fame](https://github.com/Horilla/claudectx/discussions)** — share your before/after numbers and help other developers find this tool.

---

## Contributing

We welcome PRs! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

```bash
git clone https://github.com/Horilla/claudectx.git
cd claudectx
npm install
npm run build
npm test
```

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">
  <sub>Built by <a href="https://github.com/Horilla">Horilla</a> · If claudectx saved you money, a ⭐ helps more developers find it!</sub>
</div>
