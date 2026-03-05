import { watch, FSWatcher } from 'chokidar';
import path from 'path';
import { Logger } from '../logging/logger';

export type ApprovalCallback = (filename: string, decision: 'approved' | 'rejected') => void;

export class ApprovalWatcher {
  private approvedWatcher: FSWatcher | null = null;
  private rejectedWatcher: FSWatcher | null = null;
  private approvedDir: string;
  private rejectedDir: string;
  private logger: Logger;
  private callbacks: ApprovalCallback[] = [];

  constructor(approvedDir: string, rejectedDir: string, logger: Logger) {
    this.approvedDir = approvedDir;
    this.rejectedDir = rejectedDir;
    this.logger = logger;
  }

  onDecision(callback: ApprovalCallback): void {
    this.callbacks.push(callback);
  }

  private emit(filename: string, decision: 'approved' | 'rejected'): void {
    for (const cb of this.callbacks) {
      cb(filename, decision);
    }
  }

  start(): void {
    this.logger.info('approval_watcher_start', 'Watching for approval decisions');

    this.approvedWatcher = watch(this.approvedDir, { ignoreInitial: true });
    this.approvedWatcher.on('add', (filepath: string) => {
      const filename = path.basename(filepath);
      if (filename.startsWith('APPROVAL_') && filename.endsWith('.md')) {
        this.logger.info('approval_approved', `Approved: ${filename}`);
        this.emit(filename, 'approved');
      }
    });

    this.rejectedWatcher = watch(this.rejectedDir, { ignoreInitial: true });
    this.rejectedWatcher.on('add', (filepath: string) => {
      const filename = path.basename(filepath);
      if (filename.startsWith('APPROVAL_') && filename.endsWith('.md')) {
        this.logger.info('approval_rejected', `Rejected: ${filename}`);
        this.emit(filename, 'rejected');
      }
    });
  }

  async stop(): Promise<void> {
    if (this.approvedWatcher) {
      await this.approvedWatcher.close();
      this.approvedWatcher = null;
    }
    if (this.rejectedWatcher) {
      await this.rejectedWatcher.close();
      this.rejectedWatcher = null;
    }
    this.logger.info('approval_watcher_stop', 'Approval watcher stopped');
  }
}
