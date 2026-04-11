# Contributing to claudectx

Thank you for helping reduce Claude Code costs for developers worldwide!

## Getting Started

```bash
git clone https://github.com/Horilla/claudectx.git
cd claudectx
npm install
npm run build
npm test
```

## Development

```bash
npm run dev        # Build in watch mode
npm test           # Run tests
npm run lint       # ESLint
npm run format     # Prettier
```

## Project Structure

```
src/
├── commands/      # One file per CLI command (analyze, optimize, watch, mcp, compress, report)
├── analyzer/      # Context analysis (tokenizer, context-parser, waste-detector, cost-calculator)
├── optimizer/     # Auto-fix modules (claudemd-optimizer, ignorefile-generator, cache-advisor)
├── mcp-server/    # MCP server with smart_read, diff_read, index_query tools
├── dashboard/     # Live ink TUI dashboard components
├── compressor/    # Session memory compression
├── reporter/      # Usage reporting
└── shared/        # Types, constants, models, logger, config
```

## Recording Demo GIFs

We use `asciinema` + `agg` (NOT vhs — vhs is a Go tool, not available via npm):

```bash
brew install asciinema agg
asciinema rec --title "claudectx demo" demo.cast
agg demo.cast docs/demo.gif --theme monokai --speed 1.5
```

## Pull Request Process

1. Fork the repo and create a feature branch: `git checkout -b feature/your-feature`
2. Write tests for new functionality
3. Run `npm test` and `npm run lint` — both must pass
4. Submit a PR with a clear description of the change and motivation
5. Reference the relevant Jira issue (CTX-XX) if applicable

## Commit Convention

```
feat: add smart_read MCP tool
fix: correct token count for Unicode strings
docs: update README with v0.3.0 dashboard screenshot
test: add waste-detector edge case tests
chore: update dependencies
```

## Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md).

## Sharing Token Savings

If claudectx saved you money, share your numbers in [Discussions](https://github.com/Horilla/claudectx/discussions) and join the Hall of Fame!
