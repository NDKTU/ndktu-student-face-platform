import { logService } from '@/services/logService';
import type { ClientLogEntry, ClientLogSource } from '@/services/logService';

const FLUSH_INTERVAL_MS = 3000;
const MAX_QUEUE = 25;
const DEDUPE_WINDOW_MS = 10000;
const MAX_ENTRIES_PER_MINUTE = 40;

const queue: ClientLogEntry[] = [];
const recentHashes = new Map<string, number>();
let entryTimestamps: number[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function dedupeKey(entry: ClientLogEntry): string {
    return `${entry.message}::${(entry.stack ?? '').slice(0, 200)}`;
}

function isDuplicate(entry: ClientLogEntry): boolean {
    const key = dedupeKey(entry);
    const now = Date.now();
    const lastSeen = recentHashes.get(key);
    if (lastSeen !== undefined && now - lastSeen < DEDUPE_WINDOW_MS) {
        return true;
    }
    recentHashes.set(key, now);
    return false;
}

function isOverLimit(): boolean {
    const now = Date.now();
    entryTimestamps = entryTimestamps.filter((t) => now - t < 60000);
    return entryTimestamps.length >= MAX_ENTRIES_PER_MINUTE;
}

function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
    }, FLUSH_INTERVAL_MS);
}

function flush() {
    if (queue.length === 0) return;
    const batch = queue.splice(0, queue.length);
    logService.reportClientLogs(batch).catch(() => {
        // Never let a failed log upload become another logged error — swallow silently.
    });
}

function enqueue(entry: ClientLogEntry) {
    if (isDuplicate(entry) || isOverLimit()) return;
    entryTimestamps.push(Date.now());
    queue.push(entry);
    if (queue.length >= MAX_QUEUE) {
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        flush();
    } else {
        scheduleFlush();
    }
}

function buildEntry(
    level: 'warn' | 'error',
    message: string,
    err: unknown,
    source: ClientLogSource,
    extra?: Record<string, unknown>
): ClientLogEntry {
    return {
        level,
        message,
        stack: err instanceof Error ? err.stack : err !== undefined ? String(err) : undefined,
        url: window.location.href,
        user_agent: navigator.userAgent,
        source,
        extra,
        timestamp: new Date().toISOString(),
    };
}

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
}

export const logger = {
    error: (message: string, err?: unknown, extra?: Record<string, unknown>) => {
        console.error(message, err);
        enqueue(buildEntry('error', message, err, 'console', extra));
    },
    warn: (message: string, err?: unknown, extra?: Record<string, unknown>) => {
        console.warn(message, err);
        enqueue(buildEntry('warn', message, err, 'console', extra));
    },
    _reportUncaught: (entry: ClientLogEntry) => {
        enqueue(entry);
    },
};
