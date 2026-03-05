import { loadSilverConfig, SilverConfig, MCPServerConfig } from '../../../silver/src/config/silver-config';

export interface OdooConfig {
  url: string;
  database: string;
  username: string;
  apiKey: string;
}

export interface SocialMediaCredentials {
  facebook: {
    pageId: string;
    pageAccessToken: string;
  };
  instagram: {
    businessAccountId: string;
    accessToken: string;
  };
  twitter: {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessTokenSecret: string;
  };
}

export interface WatchdogConfig {
  pidFilePath: string;
  checkIntervalMs: number;
  maxRestarts: number;
  daemonCommand: string;
  daemonArgs: string[];
}

export interface GoldConfig extends SilverConfig {
  odoo: OdooConfig;
  socialMedia: SocialMediaCredentials;
  watchdog: WatchdogConfig;
  audit: {
    logsDir: string;
    enableHashChaining: boolean;
  };
  persistence: {
    stallTimeoutMs: number;
    maxRetries: number;
    retryBackoffMs: number;
  };
  mcp: SilverConfig['mcp'] & {
    odoo: MCPServerConfig;
  };
}

export function loadGoldConfig(): GoldConfig {
  const silver = loadSilverConfig();

  return {
    ...silver,
    odoo: {
      url: process.env.ODOO_URL || 'http://localhost:8069',
      database: process.env.ODOO_DATABASE || 'mycompany',
      username: process.env.ODOO_USERNAME || 'admin',
      apiKey: process.env.ODOO_API_KEY || '',
    },
    socialMedia: {
      facebook: {
        pageId: process.env.FACEBOOK_PAGE_ID || '',
        pageAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
      },
      instagram: {
        businessAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '',
        accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
      },
      twitter: {
        apiKey: process.env.TWITTER_API_KEY || '',
        apiSecret: process.env.TWITTER_API_SECRET || '',
        accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
        accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
      },
    },
    watchdog: {
      pidFilePath: process.env.WATCHDOG_PID_FILE || 'gold/gold-daemon.pid',
      checkIntervalMs: parseInt(process.env.WATCHDOG_CHECK_INTERVAL_MS || '30000', 10),
      maxRestarts: parseInt(process.env.WATCHDOG_MAX_RESTARTS || '10', 10),
      daemonCommand: 'npx',
      daemonArgs: ['ts-node', 'gold/src/index.ts'],
    },
    audit: {
      logsDir: silver.folders.logs,
      enableHashChaining: process.env.AUDIT_ENABLE_HASH_CHAINING !== 'false',
    },
    persistence: {
      stallTimeoutMs: parseInt(process.env.PERSISTENCE_STALL_TIMEOUT_MS || '300000', 10),
      maxRetries: parseInt(process.env.PERSISTENCE_MAX_RETRIES || '3', 10),
      retryBackoffMs: parseInt(process.env.PERSISTENCE_RETRY_BACKOFF_MS || '5000', 10),
    },
    mcp: {
      ...silver.mcp,
      odoo: {
        name: 'odoo',
        command: 'npx',
        args: ['ts-node', 'gold/src/mcp-servers/odoo-mcp/index.ts'],
        env: {
          ODOO_URL: process.env.ODOO_URL || 'http://localhost:8069',
          ODOO_DATABASE: process.env.ODOO_DATABASE || 'mycompany',
          ODOO_USERNAME: process.env.ODOO_USERNAME || 'admin',
          ODOO_API_KEY: process.env.ODOO_API_KEY || '',
        },
      },
    },
  };
}
