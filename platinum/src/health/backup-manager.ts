import { HealthCheckConfig } from '../config/platinum-config';
import { Logger } from '../../../bronze/src/logging/logger';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface BackupResult {
  success: boolean;
  backupPath: string;
  sizeBytes: number;
  durationMs: number;
  error?: string;
}

export class BackupManager {
  private config: HealthCheckConfig;
  private vaultRoot: string;
  private logger: Logger;
  private backupInterval: ReturnType<typeof setInterval> | null = null;
  private lastBackupTimestamp: string | null = null;
  private maxBackups = 7;

  constructor(config: HealthCheckConfig, vaultRoot: string, logger: Logger) {
    this.config = config;
    this.vaultRoot = vaultRoot;
    this.logger = logger;
  }

  async createBackup(): Promise<BackupResult> {
    const start = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = this.config.backupPath;
    const backupFile = path.join(backupDir, `vault-backup-${timestamp}.tar.gz`);

    try {
      // Ensure backup directory exists
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Create tar.gz excluding .git, node_modules, .env files
      const excludes = '--exclude=.git --exclude=node_modules --exclude=.env --exclude=.env.*';
      const cmd = `tar ${excludes} -czf "${backupFile}" -C "${path.dirname(this.vaultRoot)}" "${path.basename(this.vaultRoot)}"`;

      execSync(cmd, { timeout: 300000 }); // 5-minute timeout

      const stats = fs.statSync(backupFile);
      this.lastBackupTimestamp = new Date().toISOString();

      this.logger.info('backup', `Vault backup created: ${backupFile} (${stats.size} bytes)`);

      // Rotate old backups
      await this.rotateBackups();

      return {
        success: true,
        backupPath: backupFile,
        sizeBytes: stats.size,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('backup', `Backup failed: ${msg}`, msg);

      return {
        success: false,
        backupPath: backupFile,
        sizeBytes: 0,
        durationMs: Date.now() - start,
        error: msg,
      };
    }
  }

  startScheduledBackups(): void {
    if (!this.config.backupEnabled) {
      this.logger.info('backup', 'Scheduled backups disabled');
      return;
    }

    if (this.backupInterval) {
      this.logger.warn('backup', 'Scheduled backups already running');
      return;
    }

    this.logger.info('backup', `Starting scheduled backups every ${this.config.backupIntervalMs}ms`);
    this.backupInterval = setInterval(async () => {
      try {
        await this.createBackup();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('backup', `Scheduled backup failed: ${msg}`, msg);
      }
    }, this.config.backupIntervalMs);
  }

  stopScheduledBackups(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
      this.logger.info('backup', 'Scheduled backups stopped');
    }
  }

  getLastBackupTimestamp(): string | null {
    return this.lastBackupTimestamp;
  }

  async listBackups(): Promise<{ path: string; timestamp: string; sizeBytes: number }[]> {
    const backupDir = this.config.backupPath;

    if (!fs.existsSync(backupDir)) return [];

    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('vault-backup-') && f.endsWith('.tar.gz'))
      .sort()
      .reverse();

    return files.map(f => {
      const fullPath = path.join(backupDir, f);
      const stats = fs.statSync(fullPath);
      return {
        path: fullPath,
        timestamp: stats.mtime.toISOString(),
        sizeBytes: stats.size,
      };
    });
  }

  private async rotateBackups(): Promise<void> {
    const backups = await this.listBackups();

    if (backups.length > this.maxBackups) {
      const toDelete = backups.slice(this.maxBackups);
      for (const backup of toDelete) {
        try {
          fs.unlinkSync(backup.path);
          this.logger.info('backup', `Rotated old backup: ${backup.path}`);
        } catch {
          this.logger.warn('backup', `Failed to delete old backup: ${backup.path}`);
        }
      }
    }
  }
}

// CLI mode: run with --once flag
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--once')) {
    const { loadPlatinumConfig } = require('../config/platinum-config');
    const { Logger } = require('../../../bronze/src/logging/logger');

    const config = loadPlatinumConfig();
    const logger = new Logger(config.vaultPath, config.logLevel);
    const manager = new BackupManager(config.healthCheck, config.vaultPath, logger);

    manager.createBackup().then(result => {
      if (result.success) {
        console.log(`Backup created: ${result.backupPath} (${result.sizeBytes} bytes, ${result.durationMs}ms)`);
      } else {
        console.error(`Backup failed: ${result.error}`);
        process.exit(1);
      }
    });
  }
}
