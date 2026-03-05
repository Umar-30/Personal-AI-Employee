import path from 'path';

export interface AppConfig {
  vaultPath: string;
  dryRun: boolean;
  logLevel: 'info' | 'warn' | 'error';
  pollIntervalMs: number;
  folders: {
    inbox: string;
    needsAction: string;
    plans: string;
    pendingApproval: string;
    approved: string;
    rejected: string;
    done: string;
    logs: string;
    briefings: string;
  };
  files: {
    dashboard: string;
    handbook: string;
    goals: string;
  };
}

export function loadConfig(): AppConfig {
  const vaultPath = process.env.VAULT_PATH || process.cwd();
  const dryRun = process.env.DRY_RUN === 'true';
  const logLevel = (process.env.LOG_LEVEL || 'info') as AppConfig['logLevel'];
  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || '2000', 10);

  return {
    vaultPath,
    dryRun,
    logLevel,
    pollIntervalMs,
    folders: {
      inbox: path.join(vaultPath, 'Inbox'),
      needsAction: path.join(vaultPath, 'Needs_Action'),
      plans: path.join(vaultPath, 'Plans'),
      pendingApproval: path.join(vaultPath, 'Pending_Approval'),
      approved: path.join(vaultPath, 'Approved'),
      rejected: path.join(vaultPath, 'Rejected'),
      done: path.join(vaultPath, 'Done'),
      logs: path.join(vaultPath, 'Logs'),
      briefings: path.join(vaultPath, 'Briefings'),
    },
    files: {
      dashboard: path.join(vaultPath, 'Dashboard.md'),
      handbook: path.join(vaultPath, 'Company_Handbook.md'),
      goals: path.join(vaultPath, 'Business_Goals.md'),
    },
  };
}
