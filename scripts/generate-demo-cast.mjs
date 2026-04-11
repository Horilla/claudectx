/**
 * Generates demo.cast (asciinema v2) for claudectx.
 *
 * Shows three commands:
 *   1. claudectx analyze   — token breakdown with warnings
 *   2. claudectx optimize --dry-run  — preview of fixes
 *   3. claudectx report   — 7-day usage analytics
 *
 * Run: node scripts/generate-demo-cast.mjs > demo.cast
 */

const WIDTH = 80;
const HEIGHT = 28;

const events = [];
let t = 0;

function emit(text) {
  events.push([parseFloat(t.toFixed(3)), 'o', text]);
}

function delay(seconds) {
  t += seconds;
}

function type(str, wpm = 180) {
  const msPerChar = (60 / (wpm * 5)) * 1000;
  for (const ch of str) {
    emit(ch);
    delay(msPerChar / 1000);
  }
}

function prompt() {
  emit('\r\n\x1b[1;32m$\x1b[0m \x1b[1;37m');
}

function newline(n = 1) {
  emit('\x1b[0m');
  for (let i = 0; i < n; i++) emit('\r\n');
}

// ─── Clear + banner ───────────────────────────────────────────────────────────

emit('\x1b[2J\x1b[H');
delay(0.2);

emit('\x1b[1;36m  claudectx\x1b[0m  \x1b[2m—  reduce Claude Code token usage by up to 80%\x1b[0m');
newline(2);
delay(0.8);

// ─── 1. claudectx analyze ─────────────────────────────────────────────────────

prompt();
delay(0.5);
type('claudectx analyze');
emit('\x1b[0m');
delay(0.5);
newline();
delay(0.6);

emit('\x1b[1;36m╔══════════════════════════════════════════════════════════════════╗\x1b[0m'); newline();
emit('\x1b[1;36m║\x1b[0m                                                                  \x1b[1;36m║\x1b[0m'); newline();
emit('\x1b[1;36m║\x1b[0m   \x1b[1;37mclaudectx — Context Analysis\x1b[0m                                   \x1b[1;36m║\x1b[0m'); newline();
emit('\x1b[1;36m║\x1b[0m   \x1b[2mProject: ~/my-project\x1b[0m                                         \x1b[1;36m║\x1b[0m'); newline();
emit('\x1b[1;36m║\x1b[0m                                                                  \x1b[1;36m║\x1b[0m'); newline();
emit('\x1b[1;36m║\x1b[0m   Tokens/request: \x1b[1;31m22,841\x1b[0m   Session cost: \x1b[1;31m$4.11\x1b[0m                   \x1b[1;36m║\x1b[0m'); newline();
emit('\x1b[1;36m║\x1b[0m   Model: claude-sonnet-4-6   Context: \x1b[1;37m2.3% of 1M window\x1b[0m         \x1b[1;36m║\x1b[0m'); newline();
emit('\x1b[1;36m║\x1b[0m                                                                  \x1b[1;36m║\x1b[0m'); newline();
emit('\x1b[1;36m╚══════════════════════════════════════════════════════════════════╝\x1b[0m'); newline();
delay(0.15);

emit('\x1b[2m┌──────────────────────────────────┬───────────┬──────────┬────────┐\x1b[0m'); newline();
emit('\x1b[2m│ Component                        │ Tokens    │ Cost/req │ Status │\x1b[0m'); newline();
emit('\x1b[2m├──────────────────────────────────┼───────────┼──────────┼────────┤\x1b[0m'); newline();

const rows = [
  ['System prompt (built-in)',     '4,200',  '$0.01', '✓ ok',   'green'],
  ['Tool definitions (built-in)', '2,100',  '$0.00', '✓ ok',   'green'],
  ['MCP schemas (4 tools)',        '720',    '$0.00', '✓ ok',   'green'],
  ['CLAUDE.md (./CLAUDE.md)',      '11,841', '$0.03', '⚠ warn', 'yellow'],
  ['MEMORY.md',                    '2,600',  '$0.01', '✓ ok',   'green'],
  ['User CLAUDE.md',               '1,380',  '$0.00', '✓ ok',   'green'],
];

for (const [name, tokens, cost, status, color] of rows) {
  const statusColor = color === 'yellow' ? '\x1b[1;33m' : '\x1b[1;32m';
  const tokColor = color === 'yellow' ? '\x1b[1;33m' : '\x1b[0m';
  emit(`\x1b[2m│\x1b[0m ${name.padEnd(32)} \x1b[2m│\x1b[0m ${tokColor}${tokens.padEnd(9)}\x1b[0m \x1b[2m│\x1b[0m ${cost.padEnd(8)} \x1b[2m│\x1b[0m ${statusColor}${status.padEnd(6)}\x1b[0m \x1b[2m│\x1b[0m`);
  newline();
  emit('\x1b[2m├──────────────────────────────────┼───────────┼──────────┼────────┤\x1b[0m'); newline();
  delay(0.07);
}

emit('\x1b[2m│\x1b[0m \x1b[1mTOTAL (per request)\x1b[0m               \x1b[2m│\x1b[0m \x1b[1;31m22,841\x1b[0m    \x1b[2m│\x1b[0m \x1b[1;31m$0.07\x1b[0m    \x1b[2m│\x1b[0m        \x1b[2m│\x1b[0m'); newline();
emit('\x1b[2m└──────────────────────────────────┴───────────┴──────────┴────────┘\x1b[0m'); newline();
delay(0.3);

newline();
emit('\x1b[1;33m⚠\x1b[0m  \x1b[1m2 optimization opportunities found:\x1b[0m'); newline(2);
delay(0.2);

emit('  \x1b[1;33m[1]\x1b[0m CLAUDE.md is \x1b[1;31m11,841 tokens\x1b[0m — 492% over the 2,000 token limit'); newline();
emit('      → \x1b[1;36mclaudectx optimize --claudemd\x1b[0m  \x1b[1;32mSaves ~9,841 tokens/req\x1b[0m'); newline(2);
delay(0.15);
emit('  \x1b[1;33m[2]\x1b[0m No \x1b[1m.claudeignore\x1b[0m — Claude may read node_modules/ dist/ etc.'); newline();
emit('      → \x1b[1;36mclaudectx optimize --ignorefile\x1b[0m'); newline(2);
delay(1.8);

// ─── 2. claudectx optimize --dry-run ─────────────────────────────────────────

prompt();
delay(0.5);
type('claudectx optimize --dry-run');
emit('\x1b[0m');
delay(0.5);
newline();
delay(0.5);

emit('\x1b[1;36m◆ claudectx optimize\x1b[0m \x1b[2m— dry run preview\x1b[0m'); newline(2);
delay(0.3);

emit('\x1b[1;37m  CLAUDE.md split\x1b[0m'); newline();
delay(0.1);
emit('  \x1b[1;32m✓\x1b[0m Keep inline \x1b[2m(core rules, 1,842 tokens)\x1b[0m'); newline();
delay(0.07);
emit('  \x1b[1;33m→\x1b[0m \x1b[2m## Architecture\x1b[0m  →  \x1b[1m.claude/architecture.md\x1b[0m  \x1b[2m[2,341 tok]\x1b[0m'); newline();
delay(0.07);
emit('  \x1b[1;33m→\x1b[0m \x1b[2m## API Structure\x1b[0m  →  \x1b[1m.claude/api-structure.md\x1b[0m  \x1b[2m[1,902 tok]\x1b[0m'); newline();
delay(0.07);
emit('  \x1b[1;33m→\x1b[0m \x1b[2m## Forms\x1b[0m          →  \x1b[1m.claude/forms.md\x1b[0m          \x1b[2m[1,104 tok]\x1b[0m'); newline();
delay(0.07);
emit('  \x1b[1;33m→\x1b[0m \x1b[2m## APScheduler\x1b[0m    →  \x1b[1m.claude/scheduler.md\x1b[0m      \x1b[2m[890 tok]\x1b[0m'); newline(2);
delay(0.2);

emit('\x1b[1;37m  .claudeignore\x1b[0m'); newline();
delay(0.07);
emit('  \x1b[1;32m+\x1b[0m Will create \x1b[1m.claudeignore\x1b[0m with 42 patterns (node, python)'); newline(2);
delay(0.2);

emit('\x1b[1;37m  Prompt caching\x1b[0m'); newline();
delay(0.07);
emit('  \x1b[1;33m~\x1b[0m Line 3: \x1b[2m# Last updated: 2026-04-11\x1b[0m  → comment out (breaks cache)'); newline(2);
delay(0.3);

emit('\x1b[2m  Savings: ~9,999 tokens/request  (~$6.00/hr at 60 req/hr)\x1b[0m'); newline(2);
emit('\x1b[1;32m  Run \x1b[1;36mclaudectx optimize --apply\x1b[0m\x1b[1;32m to apply all fixes.\x1b[0m'); newline();
delay(2.0);

// ─── 3. claudectx report ──────────────────────────────────────────────────────

prompt();
delay(0.5);
type('claudectx report --days 7');
emit('\x1b[0m');
delay(0.5);
newline();
delay(0.4);

emit('\x1b[1mclaudectx report\x1b[0m \x1b[2m— 7-day summary (2026-04-04 → 2026-04-11)\x1b[0m'); newline();
emit('\x1b[2m' + '═'.repeat(68) + '\x1b[0m'); newline();
newline();

emit('\x1b[1mTOTALS\x1b[0m'); newline();
emit('\x1b[2m' + '─'.repeat(38) + '\x1b[0m'); newline();

const totals = [
  ['Sessions', '23'],
  ['Requests', '847'],
  ['Input tokens', '2,341,200'],
  ['Cache reads', '1,204,000  \x1b[2m(51% hit rate)\x1b[0m'],
  ['Total cost (est.)', '\x1b[1;33m$4.87\x1b[0m'],
  ['Avg cost/session', '$0.21'],
];
for (const [label, value] of totals) {
  emit(`  ${(label + ':').padEnd(22)} \x1b[1m${value}\x1b[0m`);
  newline();
  delay(0.06);
}

newline();
emit('\x1b[1mDAILY USAGE\x1b[0m'); newline();
emit('\x1b[2m' + '─'.repeat(38) + '\x1b[0m'); newline();

const days = [
  ['2026-04-11', '██████████████████', '412K', '$1.02', 5],
  ['2026-04-10', '█████████░░░░░░░░░', '234K', '$0.58', 4],
  ['2026-04-09', '███████░░░░░░░░░░░', '190K', '$0.47', 3],
  ['2026-04-08', '█████░░░░░░░░░░░░░', '128K', '$0.32', 2],
  ['2026-04-06', '███░░░░░░░░░░░░░░░',  '62K', '$0.15', 3],
  ['2026-04-04', '█░░░░░░░░░░░░░░░░░',  '34K', '$0.07', 2],
];

for (const [date, bar, tok, cost, sess] of days) {
  emit(`  ${date}  \x1b[1;36m${bar}\x1b[0m  \x1b[1m${tok.padEnd(5)}\x1b[0m  \x1b[1;33m${cost}\x1b[0m  \x1b[2m(${sess} sess)\x1b[0m`);
  newline();
  delay(0.07);
}

newline();
emit('\x1b[1mTOP FILES READ\x1b[0m'); newline();
emit('\x1b[2m' + '─'.repeat(38) + '\x1b[0m'); newline();

const files = [
  ['████████████', 47, '…/src/commands/optimize.ts'],
  ['████████░░░░', 31, '…/src/compressor/session-parser.ts'],
  ['██████░░░░░░', 24, '…/src/watcher/session-store.ts'],
  ['████░░░░░░░░', 18, '…/src/index.ts'],
];
for (let i = 0; i < files.length; i++) {
  const [bar, count, file] = files[i];
  emit(`   ${String(i + 1)}.  \x1b[1;36m${bar}\x1b[0m  ×\x1b[1m${count}\x1b[0m  \x1b[2m${file}\x1b[0m`);
  newline();
  delay(0.06);
}

newline();
emit('\x1b[2m  Generated: 2026-04-11T12:00:00Z\x1b[0m'); newline();
delay(1.2);

newline();
emit('\x1b[2m  ─────────────────────────────────────────────────────────────\x1b[0m'); newline();
emit('  \x1b[1;36mnpm install -g claudectx\x1b[0m'); newline();
emit('  \x1b[2mgithub.com/Horilla/claudectx\x1b[0m'); newline();
emit('\x1b[2m  ─────────────────────────────────────────────────────────────\x1b[0m'); newline();
newline();
delay(2.5);

// ─── Write cast ───────────────────────────────────────────────────────────────

const header = {
  version: 2,
  width: WIDTH,
  height: HEIGHT,
  timestamp: Math.floor(Date.now() / 1000),
  title: 'claudectx demo — reduce Claude Code token usage by 80%',
  env: { TERM: 'xterm-256color', SHELL: '/bin/zsh' },
};

process.stdout.write(JSON.stringify(header) + '\n');
for (const event of events) {
  process.stdout.write(JSON.stringify(event) + '\n');
}
