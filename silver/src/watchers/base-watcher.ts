import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { Logger } from '../../../bronze/src/logging/logger';
import { SilverTaskFrontmatter } from '../models/extended-frontmatter';
import { createAlertFile } from '../models/alert-file';

export interface WatcherState {
  source: string;
  lastChecked: string;
  status: 'active' | 'error' | 'stopped';
  errorCount: number;
  lastError: string | null;
}

export abstract class BaseWatcher {
  protected logger: Logger;
  protected needsActionDir: string;
  protected logsDir: string;
  protected pollIntervalMs: number;
  protected state: WatcherState;
  private timer: NodeJS.Timeout | null = null;
  private stateFilePath: string;

  abstract readonly source: string;

  constructor(
    needsActionDir: string,
    logsDir: string,
    pollIntervalMs: number,
    logger: Logger,
  ) {
    this.needsActionDir = needsActionDir;
    this.logsDir = logsDir;
    this.pollIntervalMs = pollIntervalMs;
    this.logger = logger;
    this.stateFilePath = path.join(logsDir, 'watcher-state.json');
    this.state = {
      source: '',
      lastChecked: new Date().toISOString(),
      status: 'stopped',
      errorCount: 0,
      lastError: null,
    };
  }

  async start(): Promise<void> {
    this.state.source = this.source;
    this.state.status = 'active';
    this.loadState();
    this.logger.info('watcher_start', `${this.source} watcher started (poll: ${this.pollIntervalMs}ms)`);

    // Initial poll
    await this.safePoll();

    // Periodic polling
    this.timer = setInterval(() => this.safePoll(), this.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.state.status = 'stopped';
    this.saveState();
    this.logger.info('watcher_stop', `${this.source} watcher stopped`);
  }

  getState(): WatcherState {
    return { ...this.state };
  }

  protected abstract poll(): Promise<void>;

  private async safePoll(): Promise<void> {
    try {
      await this.poll();
      this.state.lastChecked = new Date().toISOString();
      this.state.errorCount = 0;
      this.state.lastError = null;
      this.state.status = 'active';
      this.saveState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.state.errorCount++;
      this.state.lastError = msg;
      this.state.status = 'error';
      this.saveState();

      this.logger.error('watcher_poll_error', `${this.source} poll failed (attempt ${this.state.errorCount}): ${msg}`, msg);

      // Create alert file on first error
      if (this.state.errorCount === 1) {
        createAlertFile('auth_failure', this.source, `Watcher poll failed: ${msg}`, this.logsDir);
      }
    }
  }

  protected createTaskFile(
    frontmatter: SilverTaskFrontmatter,
    body: string,
    slug: string,
  ): string {
    // Dedup check
    if (frontmatter.source_id && this.isDuplicate(frontmatter.source_id)) {
      this.logger.info('watcher_dedup', `Skipping duplicate: ${frontmatter.source_id}`, slug);
      return '';
    }

    const filename = `${slug}.md`;
    const filepath = path.join(this.needsActionDir, filename);

    if (!fs.existsSync(this.needsActionDir)) {
      fs.mkdirSync(this.needsActionDir, { recursive: true });
    }

    const content = matter.stringify(body, frontmatter as unknown as Record<string, unknown>);
    fs.writeFileSync(filepath, content, 'utf-8');

    this.logger.info('watcher_task_created', `Task file created: ${filename}`, slug);
    return filepath;
  }

  private isDuplicate(sourceId: string): boolean {
    if (!fs.existsSync(this.needsActionDir)) return false;

    const files = fs.readdirSync(this.needsActionDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.needsActionDir, file), 'utf-8');
        const parsed = matter(content);
        if (parsed.data.source_id === sourceId) return true;
      } catch { /* skip unreadable files */ }
    }
    return false;
  }

  private loadState(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf-8'));
        const states: Record<string, WatcherState> = data;
        if (states[this.source]) {
          this.state = { ...this.state, ...states[this.source] };
        }
      }
    } catch { /* ignore corrupt state file */ }
  }

  private saveState(): void {
    try {
      let allStates: Record<string, WatcherState> = {};
      if (fs.existsSync(this.stateFilePath)) {
        allStates = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf-8'));
      }
      allStates[this.source] = this.state;

      if (!fs.existsSync(path.dirname(this.stateFilePath))) {
        fs.mkdirSync(path.dirname(this.stateFilePath), { recursive: true });
      }
      fs.writeFileSync(this.stateFilePath, JSON.stringify(allStates, null, 2), 'utf-8');
    } catch { /* ignore state save errors */ }
  }
}
