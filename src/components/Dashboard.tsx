import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import {
  readAllEvents,
  aggregateStats,
  getReadsFilePath,
  type FileStats,
} from '../watcher/session-store.js';
import {
  findSessionFile,
  readSessionUsage,
  type SessionTokenUsage,
} from '../watcher/session-reader.js';
import { MODEL_PRICING } from '../shared/models.js';
import type { ClaudeModel } from '../shared/types.js';
import * as fs from 'fs';
import * as path from 'path';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function fmtCost(tokens: number, model: ClaudeModel): string {
  const p = MODEL_PRICING[model];
  const cost = (tokens / 1_000_000) * p.inputPerMillion;
  return `$${cost.toFixed(4)}`;
}

function shortPath(filePath: string): string {
  const parts = filePath.split(path.sep);
  if (parts.length <= 3) return filePath;
  return '…/' + parts.slice(-3).join('/');
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function padStart(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;
}

// ─── Dashboard state ──────────────────────────────────────────────────────────

interface DashboardState {
  fileStats: FileStats[];
  usage: SessionTokenUsage;
  sessionFile: string | null;
  lastUpdated: Date;
  tickCount: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner({ tick }: { tick: number }): React.ReactElement {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  return <Text color="cyan">{frames[tick % frames.length]}</Text>;
}

function SectionTitle({ children }: { children: string }): React.ReactElement {
  return (
    <Box marginBottom={0}>
      <Text bold underline color="white">
        {children}
      </Text>
    </Box>
  );
}

function UsagePanel({
  usage,
  model,
}: {
  usage: SessionTokenUsage;
  model: ClaudeModel;
}): React.ReactElement {
  const totalBillable = usage.inputTokens + usage.outputTokens;
  const cacheHitPct =
    usage.inputTokens > 0
      ? ((usage.cacheReadTokens / usage.inputTokens) * 100).toFixed(1)
      : '0.0';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <SectionTitle>Token Usage</SectionTitle>
      <Box>
        <Text dimColor>{'  Input:            '}</Text>
        <Text color="yellow">{fmtNum(usage.inputTokens)}</Text>
        {usage.cacheReadTokens > 0 && (
          <Text dimColor>{`  (${fmtNum(usage.cacheReadTokens)} from cache, ${cacheHitPct}% hit)`}</Text>
        )}
      </Box>
      <Box>
        <Text dimColor>{'  Output:           '}</Text>
        <Text color="green">{fmtNum(usage.outputTokens)}</Text>
      </Box>
      <Box>
        <Text dimColor>{'  Cache writes:     '}</Text>
        <Text color="cyan">{fmtNum(usage.cacheCreationTokens)}</Text>
      </Box>
      <Box>
        <Text dimColor>{'  Requests:         '}</Text>
        <Text>{usage.requestCount}</Text>
      </Box>
      <Box>
        <Text dimColor>{'  Estimated cost:   '}</Text>
        <Text color="magenta">{fmtCost(totalBillable, model)}</Text>
      </Box>
    </Box>
  );
}

function FileTable({ stats }: { stats: FileStats[] }): React.ReactElement {
  const COL_NUM = 4;
  const COL_READS = 6;
  const COL_FILE = 55;

  if (stats.length === 0) {
    return (
      <Box flexDirection="column">
        <SectionTitle>Files Read</SectionTitle>
        <Text dimColor>
          {'  No file reads tracked yet.\n  Install hooks first: '}
          <Text color="cyan">claudectx optimize --hooks</Text>
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <SectionTitle>{`Files Read  (${stats.length} unique)`}</SectionTitle>
      <Box>
        <Text dimColor>{padStart('#', COL_NUM) + '  '}</Text>
        <Text dimColor>{padEnd('File', COL_FILE) + '  '}</Text>
        <Text dimColor>{padStart('Reads', COL_READS)}</Text>
      </Box>
      {stats.slice(0, 18).map((s, i) => (
        <Box key={s.filePath}>
          <Text dimColor>{padStart(String(i + 1), COL_NUM) + '  '}</Text>
          <Text>{padEnd(shortPath(s.filePath), COL_FILE) + '  '}</Text>
          <Text color={s.readCount >= 3 ? 'yellow' : 'white'}>
            {padStart(String(s.readCount), COL_READS)}
          </Text>
        </Box>
      ))}
      {stats.length > 18 && (
        <Text dimColor>{`  … and ${stats.length - 18} more`}</Text>
      )}
    </Box>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

interface DashboardProps {
  model?: ClaudeModel;
  sessionId?: string;
}

export function Dashboard({
  model = 'claude-sonnet-4-6',
  sessionId,
}: DashboardProps): React.ReactElement {
  const { exit } = useApp();

  const [state, setState] = useState<DashboardState>({
    fileStats: [],
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      requestCount: 0,
    },
    sessionFile: null,
    lastUpdated: new Date(),
    tickCount: 0,
    isRefreshing: false,
  });

  const [lastManualRefresh, setLastManualRefresh] = useState<Date | null>(null);

  const refresh = useCallback(() => {
    const events = readAllEvents();
    const fileStats = aggregateStats(events);

    const sessionFile = sessionId
      ? findSessionFile(sessionId)
      : findSessionFile();

    const usagePromise = sessionFile
      ? readSessionUsage(sessionFile)
      : Promise.resolve({
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          requestCount: 0,
        });

    usagePromise.then((usage) => {
      setState((prev) => ({
        ...prev,
        fileStats,
        usage,
        sessionFile,
        lastUpdated: new Date(),
        tickCount: prev.tickCount + 1,
      }));
    }).catch(() => { /* ignore */ });
  }, [sessionId]);

  const manualRefresh = useCallback(() => {
    setLastManualRefresh(new Date());
    refresh();
    setTimeout(() => setLastManualRefresh(null), 1000);
  }, [refresh]);

  useEffect(() => {
    refresh();

    // Poll every 2s
    const interval = setInterval(refresh, 2000);

    // Also react instantly when the reads file changes
    const readsFile = getReadsFilePath();
    let watcher: fs.FSWatcher | null = null;
    const tryWatch = () => {
      if (fs.existsSync(readsFile)) {
        try {
          watcher = fs.watch(readsFile, () => refresh());
        } catch {
          /* ignore */
        }
      }
    };
    tryWatch();
    // Retry watcher setup after 3s in case file doesn't exist yet
    const watchRetry = setTimeout(tryWatch, 3000);

    return () => {
      clearInterval(interval);
      clearTimeout(watchRetry);
      watcher?.close();
    };
  }, [refresh]);

  // Spinner tick
  useEffect(() => {
    const ticker = setInterval(() => {
      setState((prev) => ({ ...prev, tickCount: prev.tickCount + 1 }));
    }, 100);
    return () => clearInterval(ticker);
  }, []);

  useInput((input, key) => {
    if (input === 'q' || input === 'Q' || key.escape) {
      exit();
      // Ensure the process exits even if there's an event loop issue
      setTimeout(() => process.exit(0), 500).unref();
    }
    if (input === 'r' || input === 'R') {
      manualRefresh();
    }
  });

  const { fileStats, usage, sessionFile, lastUpdated, tickCount } = state;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {/* ── Header ── */}
      <Box marginBottom={1}>
        <Spinner tick={tickCount} />
        <Text bold color="cyan">
          {' claudectx watch'}
        </Text>
        <Text dimColor>
          {'  —  Live Session Monitor  —  '}
          {lastUpdated.toLocaleTimeString()}
        </Text>
        {sessionFile && (
          <Text dimColor>
            {'  —  '}
            {path.basename(sessionFile, '.jsonl').slice(0, 8)}
            {'…'}
          </Text>
        )}
        {!sessionFile && (
          <Text dimColor>{'  —  no session file found'}</Text>
        )}
      </Box>

      {/* ── Token usage ── */}
      <UsagePanel usage={usage} model={model} />

      {/* ── File table ── */}
      <FileTable stats={fileStats} />

      {/* ── Footer ── */}
      <Box marginTop={1}>
        <Text dimColor>
          {'Press '}
        </Text>
        <Text bold>q</Text>
        <Text dimColor>{' to quit  •  '}</Text>
        <Text bold>r</Text>
        <Text dimColor>{' to refresh  •  Polls every 2s'}</Text>
        {lastManualRefresh && (
          <Text color="cyan">{'  (Refreshing…)'}</Text>
        )}
      </Box>
    </Box>
  );
}
