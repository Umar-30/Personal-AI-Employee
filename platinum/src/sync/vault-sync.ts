import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import { SyncConfig, ZoneOwnership, AgentMode } from '../config/platinum-config';
import { ConflictResolver } from './conflict-resolver';
import { Logger } from '../../../bronze/src/logging/logger';
import path from 'path';

export interface SyncResult {
  success: boolean;
  direction: 'push' | 'pull' | 'both';
  filesChanged: number;
  conflictsDetected: number;
  conflictsResolved: number;
  errors: string[];
  durationMs: number;
}

export class VaultSync {
  private git: SimpleGit;
  private config: SyncConfig;
  private conflictResolver: ConflictResolver;
  private logger: Logger;
  private vaultRoot: string;
  private autoSyncInterval: ReturnType<typeof setInterval> | null = null;
  private lastSyncTimestamp: string | null = null;
  private lastSyncHealthy = true;

  constructor(
    vaultRoot: string,
    config: SyncConfig,
    ownership: ZoneOwnership,
    agentMode: AgentMode,
    logger: Logger,
  ) {
    this.vaultRoot = vaultRoot;
    this.config = config;
    this.logger = logger;

    const gitOptions: Partial<SimpleGitOptions> = {
      baseDir: vaultRoot,
      binary: 'git',
      maxConcurrentProcesses: 1,
    };

    if (config.sshKeyPath) {
      gitOptions.config = [`core.sshCommand=ssh -i ${config.sshKeyPath} -o StrictHostKeyChecking=no`];
    }

    this.git = simpleGit(gitOptions);
    this.conflictResolver = new ConflictResolver(ownership, agentMode, logger, vaultRoot);
  }

  async sync(): Promise<SyncResult> {
    const start = Date.now();
    const errors: string[] = [];
    let filesChanged = 0;
    let conflictsDetected = 0;
    let conflictsResolved = 0;

    try {
      // Step 1: Pull with rebase
      try {
        const pullResult = await this.git.pull('origin', this.config.branch, ['--rebase']);
        filesChanged += pullResult.files?.length || 0;
        this.logger.info('vault_sync', `Pull complete: ${filesChanged} files changed`);
      } catch (pullErr: unknown) {
        const msg = pullErr instanceof Error ? pullErr.message : String(pullErr);

        // Check for merge conflicts
        if (msg.includes('CONFLICT') || msg.includes('conflict')) {
          this.logger.warn('vault_sync', `Conflicts detected during pull: ${msg}`);
          const conflictFiles = await this.getConflictedFiles();
          conflictsDetected = conflictFiles.length;

          if (conflictFiles.length > 0) {
            const records = await this.conflictResolver.resolve(conflictFiles);
            conflictsResolved = records.length;

            // Stage resolved files
            await this.git.add('.');
            await this.git.raw(['rebase', '--continue']);
          }
        } else {
          errors.push(`Pull failed: ${msg}`);
          this.logger.error('vault_sync', `Pull failed: ${msg}`, msg);
        }
      }

      // Step 2: Commit local changes
      if (this.config.autoCommit) {
        const status = await this.git.status();
        if (status.files.length > 0) {
          await this.git.add('.');
          await this.git.commit(`Auto-sync: ${new Date().toISOString()}`);
          this.logger.info('vault_sync', `Committed ${status.files.length} local changes`);
          filesChanged += status.files.length;
        }
      }

      // Step 3: Push
      try {
        await this.git.push('origin', this.config.branch);
        this.logger.info('vault_sync', 'Push complete');
      } catch (pushErr: unknown) {
        const msg = pushErr instanceof Error ? pushErr.message : String(pushErr);
        errors.push(`Push failed: ${msg}`);
        this.logger.error('vault_sync', `Push failed: ${msg}`, msg);
      }

      this.lastSyncTimestamp = new Date().toISOString();
      this.lastSyncHealthy = errors.length === 0;

      return {
        success: errors.length === 0,
        direction: 'both',
        filesChanged,
        conflictsDetected,
        conflictsResolved,
        errors,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('vault_sync', `Sync cycle failed: ${msg}`, msg);
      this.lastSyncHealthy = false;

      return {
        success: false,
        direction: 'both',
        filesChanged,
        conflictsDetected,
        conflictsResolved,
        errors: [msg],
        durationMs: Date.now() - start,
      };
    }
  }

  startAutoSync(): void {
    if (!this.config.enabled) {
      this.logger.info('vault_sync', 'Vault sync disabled — skipping auto-sync');
      return;
    }

    if (this.autoSyncInterval) {
      this.logger.warn('vault_sync', 'Auto-sync already running');
      return;
    }

    this.logger.info('vault_sync', `Starting auto-sync every ${this.config.intervalMs}ms`);
    this.autoSyncInterval = setInterval(async () => {
      try {
        const result = await this.sync();
        if (!result.success) {
          this.logger.warn('vault_sync', `Auto-sync completed with errors: ${result.errors.join(', ')}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('vault_sync', `Auto-sync failed: ${msg}`, msg);
      }
    }, this.config.intervalMs);

    // Run initial sync immediately
    this.sync().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('vault_sync', `Initial sync failed: ${msg}`, msg);
    });
  }

  stopAutoSync(): void {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
      this.logger.info('vault_sync', 'Auto-sync stopped');
    }
  }

  getLastSyncTimestamp(): string | null {
    return this.lastSyncTimestamp;
  }

  isSyncHealthy(): boolean {
    return this.lastSyncHealthy;
  }

  private async getConflictedFiles(): Promise<string[]> {
    try {
      const status = await this.git.status();
      return status.conflicted || [];
    } catch {
      return [];
    }
  }
}
