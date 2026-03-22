import fs from 'fs';
import path from 'path';
import { MCPServerConfig } from '../config/silver-config';

/**
 * Refresh Gmail OAuth token if expired (uses refresh_token, no browser needed).
 * Called before connecting to Gmail MCP to prevent -32001 timeout errors.
 */
export async function ensureGmailTokenFresh(): Promise<void> {
  const tokenPath = process.env.GMAIL_TOKEN_PATH || path.resolve('./token.json');
  const credPath = process.env.GMAIL_CREDENTIALS_PATH || path.resolve('./credentials.json');

  if (!fs.existsSync(tokenPath) || !fs.existsSync(credPath)) return;

  try {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));

    const expiryDate: number = token.expiry_date || 0;
    const bufferMs = 5 * 60 * 1000; // refresh 5 min before expiry
    if (Date.now() < expiryDate - bufferMs) return; // still valid

    if (!token.refresh_token) return; // nothing we can do without refresh_token

    const { client_id, client_secret } = creds.installed || creds.web || {};
    if (!client_id || !client_secret) return;

    // Exchange refresh_token for new access_token via Google's token endpoint
    const params = new URLSearchParams({
      client_id,
      client_secret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) return; // silent fail — let MCP try with old token

    const refreshed = await res.json() as Record<string, unknown>;
    const merged = {
      ...token,
      access_token: refreshed['access_token'] ?? token.access_token,
      expiry_date: typeof refreshed['expires_in'] === 'number'
        ? Date.now() + (refreshed['expires_in'] as number) * 1000
        : token.expiry_date,
      token_type: refreshed['token_type'] ?? token.token_type,
    };

    fs.writeFileSync(tokenPath, JSON.stringify(merged, null, 2));
  } catch {
    // silent — do not block daemon startup on token refresh failure
  }
}

export function getGmailMCPConfig(): MCPServerConfig {
  const vaultRoot = process.env.VAULT_PATH || process.cwd();
  // Use MCP_GMAIL_ARGS if set (space-split), otherwise use the wrapper script as a single arg
  const args = process.env.MCP_GMAIL_ARGS
    ? process.env.MCP_GMAIL_ARGS.split(' ')
    : [path.join(vaultRoot, 'gmail-mcp-stdio.js')];

  return {
    name: 'gmail',
    command: process.env.MCP_GMAIL_COMMAND || 'node',
    args,
    env: {
      GMAIL_CREDENTIALS_PATH: process.env.GMAIL_CREDENTIALS_PATH || path.join(vaultRoot, 'credentials.json'),
      GMAIL_TOKEN_PATH: process.env.GMAIL_TOKEN_PATH || path.join(vaultRoot, 'token.json'),
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
