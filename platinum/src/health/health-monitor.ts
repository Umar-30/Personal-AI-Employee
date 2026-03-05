import { HealthCheckConfig, AgentMode } from '../config/platinum-config';
import { Logger } from '../../../bronze/src/logging/logger';
import { AuditLogger } from '../../../gold/src/logging/audit-logger';
import fs from 'fs';
import path from 'path';

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
  syncFreshness: number | null;
  diskUsagePercent: number;
  lastBackupTimestamp: string | null;
  healthy: boolean;
}

type ServiceChecker = () => Promise<boolean>;

export class HealthMonitor {
  private config: HealthCheckConfig;
  private agentMode: AgentMode;
  private logger: Logger;
  private auditLogger: AuditLogger;
  private startTime: number;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private serviceCheckers: Map<string, ServiceChecker> = new Map();
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  private syncHealthChecker: (() => boolean) | null = null;
  private syncTimestampGetter: (() => string | null) | null = null;
  private lastBackupTimestamp: string | null = null;
  private vaultRoot: string;

  constructor(
    config: HealthCheckConfig,
    agentMode: AgentMode,
    vaultRoot: string,
    logger: Logger,
    auditLogger: AuditLogger,
  ) {
    this.config = config;
    this.agentMode = agentMode;
    this.vaultRoot = vaultRoot;
    this.logger = logger;
    this.auditLogger = auditLogger;
    this.startTime = Date.now();
  }

  registerService(name: string, checker: ServiceChecker): void {
    this.serviceCheckers.set(name, checker);
    this.serviceHealth.set(name, {
      name,
      available: true,
      lastCheck: new Date().toISOString(),
      consecutiveFailures: 0,
    });
  }

  registerSyncHealthChecker(healthChecker: () => boolean, timestampGetter: () => string | null): void {
    this.syncHealthChecker = healthChecker;
    this.syncTimestampGetter = timestampGetter;
  }

  setLastBackupTimestamp(timestamp: string): void {
    this.lastBackupTimestamp = timestamp;
  }

  start(): void {
    if (this.config.checkIntervalMs <= 0) {
      this.logger.info('health_monitor', 'Health monitoring disabled (interval <= 0)');
      return;
    }

    if (this.checkInterval) {
      this.logger.warn('health_monitor', 'Health monitor already running');
      return;
    }

    this.logger.info('health_monitor', `Starting health monitor (interval: ${this.config.checkIntervalMs}ms)`);
    this.checkInterval = setInterval(() => this.runChecks(), this.config.checkIntervalMs);

    // Run initial check
    this.runChecks();
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      this.logger.info('health_monitor', 'Health monitor stopped');
    }
  }

  getStatus(): HealthStatus {
    const services = Array.from(this.serviceHealth.values());
    const allServicesHealthy = services.every(s => s.available);

    let syncFreshness: number | null = null;
    if (this.syncTimestampGetter) {
      const lastSync = this.syncTimestampGetter();
      if (lastSync) {
        syncFreshness = Date.now() - new Date(lastSync).getTime();
      }
    }

    const syncHealthy = syncFreshness === null ||
      syncFreshness < this.config.syncStaleThresholdMs;

    return {
      agentMode: this.agentMode,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      services,
      syncFreshness,
      diskUsagePercent: 0, // Placeholder — actual check in runChecks
      lastBackupTimestamp: this.lastBackupTimestamp,
      healthy: allServicesHealthy && syncHealthy,
    };
  }

  isServiceHealthy(name: string): boolean {
    const health = this.serviceHealth.get(name);
    return health?.available ?? false;
  }

  private async runChecks(): Promise<void> {
    // Check each registered service
    for (const [name, checker] of this.serviceCheckers) {
      try {
        const available = await checker();
        const current = this.serviceHealth.get(name)!;

        if (available) {
          this.serviceHealth.set(name, {
            ...current,
            available: true,
            lastCheck: new Date().toISOString(),
            consecutiveFailures: 0,
          });
        } else {
          const failures = current.consecutiveFailures + 1;
          this.serviceHealth.set(name, {
            ...current,
            available: false,
            lastCheck: new Date().toISOString(),
            consecutiveFailures: failures,
          });

          this.logger.warn('health_monitor', `Service ${name} unhealthy (failures: ${failures})`);

          if (failures >= 3) {
            this.createAlert(`Service ${name} has failed ${failures} consecutive checks`);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('health_monitor', `Health check failed for ${name}: ${msg}`, msg);
      }
    }

    // Check sync freshness
    if (this.syncTimestampGetter) {
      const lastSync = this.syncTimestampGetter();
      if (lastSync) {
        const freshness = Date.now() - new Date(lastSync).getTime();
        if (freshness > this.config.syncStaleThresholdMs) {
          this.logger.warn('health_monitor', `Sync is stale: ${Math.floor(freshness / 1000)}s since last sync`);
          this.createAlert(`Vault sync stale: ${Math.floor(freshness / 1000)}s since last successful sync`);
        }
      }
    }

    // Write health status to Logs
    try {
      const status = this.getStatus();
      const healthFile = path.join(this.vaultRoot, 'Logs', 'health-status.json');
      fs.writeFileSync(healthFile, JSON.stringify(status, null, 2), 'utf-8');
    } catch {
      // Non-critical — don't crash on log write failure
    }
  }

  private createAlert(message: string): void {
    const alertFile = path.join(
      this.vaultRoot,
      'Logs',
      `ALERT_health_${Date.now()}.md`,
    );

    const content = `---
type: health_alert
severity: warning
timestamp: ${new Date().toISOString()}
agent_mode: ${this.agentMode}
---

# Health Alert

${message}

**Agent Mode**: ${this.agentMode}
**Timestamp**: ${new Date().toISOString()}
`;

    try {
      fs.writeFileSync(alertFile, content, 'utf-8');
      this.logger.warn('health_monitor', `Alert created: ${alertFile}`);
    } catch {
      this.logger.error('health_monitor', `Failed to create alert file`, message);
    }
  }
}
