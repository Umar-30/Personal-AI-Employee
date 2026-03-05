import { watch, FSWatcher } from 'chokidar';
import path from 'path';
import { Logger } from '../logging/logger';

export type FileCallback = (filepath: string) => void;

export class InboxWatcher {
  private watcher: FSWatcher | null = null;
  private inboxPath: string;
  private logger: Logger;
  private onFile: FileCallback;

  constructor(inboxPath: string, logger: Logger, onFile: FileCallback) {
    this.inboxPath = inboxPath;
    this.logger = logger;
    this.onFile = onFile;
  }

  start(): void {
    this.logger.info('watcher_start', `Watching ${this.inboxPath} for new .md files`);

    this.watcher = watch(this.inboxPath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher.on('add', (filepath: string) => {
      const ext = path.extname(filepath).toLowerCase();

      if (ext !== '.md') {
        this.logger.warn('watcher_ignore', `Ignoring non-markdown file: ${path.basename(filepath)}`);
        return;
      }

      this.logger.info('watcher_detect', `Detected new file: ${path.basename(filepath)}`);
      this.onFile(filepath);
    });

    this.watcher.on('error', (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error('watcher_error', `Watcher error: ${msg}`, msg);
    });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.logger.info('watcher_stop', 'Inbox watcher stopped');
    }
  }
}
