/**
 * Platinum Tier — Split-Brain Production AI Employee
 * TypeScript Contracts & Interfaces
 *
 * These contracts define the public API surface for the Platinum tier.
 * Implementation details are intentionally omitted.
 */

import { GoldConfig } from '../../../gold/src/config/gold-config';
import { GoldExecutionContext } from '../../../gold/src/pipeline/gold-executor';
import { Logger } from '../../../bronze/src/logging/logger';
import { AuditLogger } from '../../../gold/src/logging/audit-logger';

// ─── Agent Mode ────────────────────────────────────────────────────────────

export type AgentMode = 'cloud' | 'local';

// ─── Platinum Config ───────────────────────────────────────────────────────

export interface SyncConfig {
  enabled: boolean;
  intervalMs: number;
  remoteUrl: string;           // Git remote URL for vault
  branch: string;              // Git branch for vault sync
  autoCommit: boolean;
  sshKeyPath: string;
}

export interface ZoneOwnership {
  cloud: string[];             // Folders cloud agent owns
  local: string[];             // Folders local agent owns
  localExclusive: string[];    // Root files only local can write
  sharedRead: string[];        // Folders both can read
}

export interface DeploymentConfig {
  supervisor: 'systemd' | 'pm2';
  serviceName: string;         // systemd unit name or PM2 app name
  restartPolicy: 'always' | 'on-failure';
  maxRestarts: number;
}

export interface HealthCheckConfig {
  checkIntervalMs: number;
  syncStaleThresholdMs: number; // Alert if sync hasn't completed in this time
  diskUsageThresholdPercent: number;
  backupIntervalMs: number;
  backupPath: string;
}

export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  burstSize: number;
}

export interface PlatinumConfig extends GoldConfig {
  agentMode: AgentMode;
  sync: SyncConfig;
  zoneOwnership: ZoneOwnership;
  deployment: DeploymentConfig;
  healthCheck: HealthCheckConfig;
  rateLimit: RateLimitConfig;
}

// ─── Zone Guard ────────────────────────────────────────────────────────────

export interface IZoneGuard {
  /**
   * Check if the current agent mode is allowed to write to the given path.
   * Returns true if write is permitted, false if blocked.
   */
  canWrite(vaultRelativePath: string): boolean;

  /**
   * Assert write permission. Throws ZoneViolationError if not allowed.
   */
  assertWrite(vaultRelativePath: string): void;

  /**
   * Get the owning agent mode for a vault path.
   */
  getOwner(vaultRelativePath: string): AgentMode | 'shared';
}

export class ZoneViolationError extends Error {
  constructor(
    public readonly path: string,
    public readonly attemptedBy: AgentMode,
    public readonly ownedBy: AgentMode | 'shared',
  ) {
    super(`Zone violation: ${attemptedBy} agent cannot write to ${path} (owned by ${ownedBy})`);
    this.name = 'ZoneViolationError';
  }
}

// ─── Vault Sync ────────────────────────────────────────────────────────────

export interface SyncResult {
  success: boolean;
  direction: 'push' | 'pull' | 'both';
  filesChanged: number;
  conflictsDetected: number;
  conflictsResolved: number;
  errors: string[];
  durationMs: number;
}

export interface SyncConflictRecord {
  timestamp: string;
  filePath: string;
  cloudHash: string;
  localHash: string;
  resolution: 'cloud_wins' | 'local_wins';
  stashedPath: string;
}

export interface IVaultSync {
  /**
   * Run a single sync cycle: pull → resolve conflicts → commit → push.
   */
  sync(): Promise<SyncResult>;

  /**
   * Start the automatic sync loop on the configured interval.
   */
  startAutoSync(): void;

  /**
   * Stop the automatic sync loop.
   */
  stopAutoSync(): void;

  /**
   * Get the timestamp of the last successful sync.
   */
  getLastSyncTimestamp(): string | null;

  /**
   * Check if sync is healthy (last sync completed without errors).
   */
  isSyncHealthy(): boolean;
}

// ─── Health Monitor ────────────────────────────────────────────────────────

export interface ServiceHealth {
  name: string;
  available: boolean;
  lastCheck: string;
  consecutiveFailures: number;
}

export interface HealthStatus {
  agentMode: AgentMode;
  uptimeSeconds: number;
  services: ServiceHealth[];
  syncFreshness: number | null;  // ms since last sync, null if sync disabled
  diskUsagePercent: number;
  lastBackupTimestamp: string | null;
  healthy: boolean;              // Overall health (all checks pass)
}

export interface IHealthMonitor {
  /**
   * Start periodic health checks.
   */
  start(): void;

  /**
   * Stop periodic health checks.
   */
  stop(): void;

  /**
   * Get current health status snapshot.
   */
  getStatus(): HealthStatus;

  /**
   * Register a service to monitor.
   */
  registerService(name: string, checker: () => Promise<boolean>): void;

  /**
   * Check if a specific service is healthy.
   */
  isServiceHealthy(name: string): boolean;
}

// ─── Rate Limiter ──────────────────────────────────────────────────────────

export interface IRateLimiter {
  /**
   * Check if a request can proceed. Returns true if within limits.
   */
  canProceed(serviceKey: string): boolean;

  /**
   * Record a request. Call after successful API call.
   */
  recordRequest(serviceKey: string): void;

  /**
   * Get time in ms until the next request is allowed.
   * Returns 0 if a request can proceed now.
   */
  getWaitTime(serviceKey: string): number;
}

// ─── Backup Manager ────────────────────────────────────────────────────────

export interface BackupResult {
  success: boolean;
  backupPath: string;
  sizeBytes: number;
  durationMs: number;
  error?: string;
}

export interface IBackupManager {
  /**
   * Create a vault backup (compressed archive).
   */
  createBackup(): Promise<BackupResult>;

  /**
   * Start scheduled backups on the configured interval.
   */
  startScheduledBackups(): void;

  /**
   * Stop scheduled backups.
   */
  stopScheduledBackups(): void;

  /**
   * Get the timestamp of the last successful backup.
   */
  getLastBackupTimestamp(): string | null;

  /**
   * List available backups.
   */
  listBackups(): Promise<{ path: string; timestamp: string; sizeBytes: number }[]>;
}

// ─── Platinum Execution Context ────────────────────────────────────────────

export interface PlatinumExecutionContext extends GoldExecutionContext {
  agentMode: AgentMode;
  zoneGuard: IZoneGuard;
  rateLimiter: IRateLimiter;
  healthMonitor: IHealthMonitor;
}

// ─── Platinum Daemon ───────────────────────────────────────────────────────

export interface IPlatinumDaemon {
  /**
   * Start the daemon in the configured agent mode.
   */
  start(): Promise<void>;

  /**
   * Gracefully shut down all services.
   */
  shutdown(): Promise<void>;

  /**
   * Get the current agent mode.
   */
  getMode(): AgentMode;

  /**
   * Get the current health status.
   */
  getHealth(): HealthStatus;
}

// ─── Deployment Scripts ────────────────────────────────────────────────────

export interface SystemdUnitConfig {
  description: string;
  execStart: string;
  workingDirectory: string;
  environmentFile: string;
  user: string;
  restart: 'always' | 'on-failure';
  restartSec: number;
}

export interface PM2EcosystemConfig {
  name: string;
  script: string;
  cwd: string;
  env_file: string;
  instances: 1;
  autorestart: boolean;
  max_restarts: number;
  restart_delay: number;
}
