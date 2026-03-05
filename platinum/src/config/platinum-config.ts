import { loadGoldConfig, GoldConfig } from '../../../gold/src/config/gold-config';

export type AgentMode = 'cloud' | 'local';

export interface SyncConfig {
  enabled: boolean;
  intervalMs: number;
  remoteUrl: string;
  branch: string;
  autoCommit: boolean;
  sshKeyPath: string;
}

export interface ZoneOwnership {
  cloud: string[];
  local: string[];
  localExclusive: string[];
  sharedRead: string[];
}

export interface DeploymentConfig {
  supervisor: 'systemd' | 'pm2';
  serviceName: string;
  restartPolicy: 'always' | 'on-failure';
  maxRestarts: number;
}

export interface HealthCheckConfig {
  checkIntervalMs: number;
  syncStaleThresholdMs: number;
  diskUsageThresholdPercent: number;
  backupIntervalMs: number;
  backupPath: string;
  backupEnabled: boolean;
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

export function loadPlatinumConfig(): PlatinumConfig {
  const gold = loadGoldConfig();

  const agentMode = ((process.env.AGENT_MODE || 'local').trim()) as AgentMode;
  if (agentMode !== 'cloud' && agentMode !== 'local') {
    throw new Error(`Invalid AGENT_MODE: ${agentMode}. Must be 'cloud' or 'local'.`);
  }

  // T037: Odoo HTTPS warning for cloud mode
  if (agentMode === 'cloud' && gold.odoo.url && !gold.odoo.url.startsWith('https://')) {
    console.warn(`[WARNING] Odoo URL is not HTTPS (${gold.odoo.url}). Production cloud deployments should use HTTPS.`);
  }

  return {
    ...gold,
    agentMode,
    sync: {
      enabled: process.env.VAULT_SYNC_ENABLED === 'true',
      intervalMs: parseInt(process.env.VAULT_SYNC_INTERVAL_MS || '60000', 10),
      remoteUrl: process.env.VAULT_SYNC_REMOTE_URL || '',
      branch: process.env.VAULT_SYNC_BRANCH || 'main',
      autoCommit: process.env.VAULT_SYNC_AUTO_COMMIT !== 'false',
      sshKeyPath: process.env.VAULT_SYNC_SSH_KEY || '',
    },
    zoneOwnership: {
      cloud: ['/Needs_Action', '/Plans', '/Updates', '/Logs'],
      local: ['/Pending_Approval', '/Approved', '/Rejected', '/Done', '/Briefings'],
      localExclusive: ['Dashboard.md', 'Company_Handbook.md', 'Business_Goals.md'],
      sharedRead: ['/Inbox'],
    },
    deployment: {
      supervisor: (process.env.DEPLOYMENT_SUPERVISOR || 'systemd') as 'systemd' | 'pm2',
      serviceName: process.env.DEPLOYMENT_SERVICE_NAME || 'ai-employee-cloud',
      restartPolicy: (process.env.DEPLOYMENT_RESTART_POLICY || 'on-failure') as 'always' | 'on-failure',
      maxRestarts: parseInt(process.env.DEPLOYMENT_MAX_RESTARTS || '10', 10),
    },
    healthCheck: {
      checkIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '60000', 10),
      syncStaleThresholdMs: parseInt(process.env.HEALTH_SYNC_STALE_THRESHOLD_MS || '300000', 10),
      diskUsageThresholdPercent: parseInt(process.env.HEALTH_DISK_THRESHOLD_PCT || '90', 10),
      backupIntervalMs: parseInt(process.env.BACKUP_INTERVAL_MS || '86400000', 10),
      backupPath: process.env.BACKUP_PATH || './backups',
      backupEnabled: process.env.BACKUP_ENABLED === 'true',
    },
    rateLimit: {
      maxRequestsPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '30', 10),
      maxRequestsPerHour: parseInt(process.env.RATE_LIMIT_PER_HOUR || '500', 10),
      burstSize: parseInt(process.env.RATE_LIMIT_BURST_SIZE || '10', 10),
    },
  };
}
