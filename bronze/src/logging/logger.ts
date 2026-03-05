import fs from 'fs';
import path from 'path';
import { LogEntry, LogLevel, LogOutcome } from './types';

export class Logger {
  private logsDir: string;
  private minLevel: LogLevel;

  private static LEVEL_ORDER: Record<LogLevel, number> = { info: 0, warn: 1, error: 2 };

  constructor(logsDir: string, minLevel: LogLevel = 'info') {
    this.logsDir = logsDir;
    this.minLevel = minLevel;
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }

  private getDailyLogPath(): string {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logsDir, `${date}.json`);
  }

  private shouldLog(level: LogLevel): boolean {
    return Logger.LEVEL_ORDER[level] >= Logger.LEVEL_ORDER[this.minLevel];
  }

  log(
    level: LogLevel,
    action: string,
    detail: string,
    options: { taskRef?: string; outcome?: LogOutcome; error?: string } = {},
  ): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      action,
      taskRef: options.taskRef ?? null,
      detail,
      outcome: options.outcome ?? 'success',
      error: options.error ?? null,
    };

    const logPath = this.getDailyLogPath();
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8');

    // Also print to console
    const prefix = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'INFO';
    console.log(`[${prefix}] ${action}: ${detail}`);
  }

  info(action: string, detail: string, taskRef?: string): void {
    this.log('info', action, detail, { taskRef, outcome: 'success' });
  }

  warn(action: string, detail: string, taskRef?: string): void {
    this.log('warn', action, detail, { taskRef, outcome: 'skipped' });
  }

  error(action: string, detail: string, error?: string, taskRef?: string): void {
    this.log('error', action, detail, { taskRef, outcome: 'failure', error });
  }

  getRecentEntries(count: number = 10): LogEntry[] {
    const logPath = this.getDailyLogPath();
    if (!fs.existsSync(logPath)) return [];

    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
    return lines
      .slice(-count)
      .map(line => {
        try {
          return JSON.parse(line) as LogEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is LogEntry => e !== null);
  }
}
