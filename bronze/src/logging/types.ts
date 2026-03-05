export type LogLevel = 'info' | 'warn' | 'error';
export type LogOutcome = 'success' | 'failure' | 'skipped';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  action: string;
  taskRef: string | null;
  detail: string;
  outcome: LogOutcome;
  error: string | null;
}
