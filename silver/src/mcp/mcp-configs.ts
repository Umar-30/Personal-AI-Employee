import { MCPServerConfig } from '../config/silver-config';

export function getGmailMCPConfig(): MCPServerConfig {
  return {
    name: 'gmail',
    command: process.env.MCP_GMAIL_COMMAND || 'npx',
    args: (process.env.MCP_GMAIL_ARGS || '@gongrzhe/server-gmail-mcp').split(' '),
    env: {
      GMAIL_CREDENTIALS_PATH: process.env.GMAIL_CREDENTIALS_PATH || './credentials.json',
      GMAIL_TOKEN_PATH: process.env.GMAIL_TOKEN_PATH || './token.json',
    },
  };
}

export function getLinkedInMCPConfig(): MCPServerConfig {
  return {
    name: 'linkedin',
    command: process.env.MCP_LINKEDIN_COMMAND || 'npx',
    args: (process.env.MCP_LINKEDIN_ARGS || 'linkedin-mcp-server').split(' '),
    env: {
      LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID || '',
      LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET || '',
      LINKEDIN_ACCESS_TOKEN: process.env.LINKEDIN_ACCESS_TOKEN || '',
    },
  };
}
