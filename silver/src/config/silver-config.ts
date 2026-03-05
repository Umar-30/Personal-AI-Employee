import { loadConfig, AppConfig } from '../../../bronze/src/config/config';

export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface WatcherConfig {
  source: string;
  pollIntervalMs: number;
  enabled: boolean;
}

export interface SilverConfig extends AppConfig {
  watchers: {
    gmail: WatcherConfig & {
      credentialsPath: string;
      tokenPath: string;
    };
    linkedin: WatcherConfig & {
      clientId: string;
      clientSecret: string;
      accessToken: string;
    };
    whatsapp: WatcherConfig & {
      instanceId: string;
      apiToken: string;
    };
  };
  mcp: {
    gmail: MCPServerConfig;
    linkedin: MCPServerConfig;
  };
  scheduler: {
    enabled: boolean;
  };
}

export function loadSilverConfig(): SilverConfig {
  const base = loadConfig();

  return {
    ...base,
    watchers: {
      gmail: {
        source: 'gmail',
        pollIntervalMs: parseInt(process.env.GMAIL_POLL_INTERVAL_MS || '30000', 10),
        enabled: !!process.env.GMAIL_CREDENTIALS_PATH,
        credentialsPath: process.env.GMAIL_CREDENTIALS_PATH || './credentials.json',
        tokenPath: process.env.GMAIL_TOKEN_PATH || './token.json',
      },
      linkedin: {
        source: 'linkedin',
        pollIntervalMs: parseInt(process.env.LINKEDIN_POLL_INTERVAL_MS || '60000', 10),
        enabled: !!process.env.LINKEDIN_ACCESS_TOKEN,
        clientId: process.env.LINKEDIN_CLIENT_ID || '',
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
        accessToken: process.env.LINKEDIN_ACCESS_TOKEN || '',
      },
      whatsapp: {
        source: 'whatsapp',
        pollIntervalMs: parseInt(process.env.WHATSAPP_POLL_INTERVAL_MS || '30000', 10),
        enabled: !!(process.env.GREEN_API_INSTANCE_ID && process.env.GREEN_API_TOKEN),
        instanceId: process.env.GREEN_API_INSTANCE_ID || '',
        apiToken: process.env.GREEN_API_TOKEN || '',
      },
    },
    mcp: {
      gmail: {
        name: 'gmail',
        command: process.env.MCP_GMAIL_COMMAND || 'npx',
        args: (process.env.MCP_GMAIL_ARGS || '@gongrzhe/server-gmail-mcp').split(' '),
      },
      linkedin: {
        name: 'linkedin',
        command: process.env.MCP_LINKEDIN_COMMAND || 'npx',
        args: (process.env.MCP_LINKEDIN_ARGS || 'linkedin-mcp-server').split(' '),
      },
    },
    scheduler: {
      enabled: process.env.SCHEDULER_ENABLED !== 'false',
    },
  };
}
