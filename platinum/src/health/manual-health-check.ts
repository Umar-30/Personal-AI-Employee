import { loadPlatinumConfig } from '../config/platinum-config';
import { HealthMonitor } from './health-monitor';
import { AuditLogger } from '../../../gold/src/logging/audit-logger';
import { Logger } from '../../../bronze/src/logging/logger';

async function manualHealthCheck(): Promise<void> {
  const config = loadPlatinumConfig();
  const logger = new Logger(config.vaultPath, config.logLevel);
  const auditLogger = new AuditLogger(config.audit.logsDir, config.audit.enableHashChaining);

  const monitor = new HealthMonitor(
    config.healthCheck,
    config.agentMode,
    config.vaultPath,
    logger,
    auditLogger,
  );

  console.log('=== AI Employee Health Check ===\n');
  console.log(`Agent mode: ${config.agentMode}`);
  console.log(`Vault: ${config.vaultPath}`);
  console.log();

  const status = monitor.getStatus();

  console.log(`Uptime: ${status.uptimeSeconds}s`);
  console.log(`Overall healthy: ${status.healthy}`);
  console.log(`Sync freshness: ${status.syncFreshness !== null ? `${Math.floor(status.syncFreshness / 1000)}s` : 'N/A'}`);
  console.log(`Last backup: ${status.lastBackupTimestamp || 'Never'}`);

  if (status.services.length > 0) {
    console.log('\nServices:');
    for (const svc of status.services) {
      const icon = svc.available ? 'OK' : 'FAIL';
      console.log(`  [${icon}] ${svc.name} (failures: ${svc.consecutiveFailures})`);
    }
  } else {
    console.log('\nNo services registered (run within daemon for full health check)');
  }

  console.log();
  process.exit(status.healthy ? 0 : 1);
}

manualHealthCheck().catch(err => {
  console.error('Health check failed:', err);
  process.exit(1);
});
