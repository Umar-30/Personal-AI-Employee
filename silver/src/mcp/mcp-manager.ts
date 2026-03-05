import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Logger } from '../../../bronze/src/logging/logger';
import { MCPServerConfig } from '../config/silver-config';
import { logMCPCall } from './mcp-logger';
import { createAlertFile } from '../models/alert-file';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export interface MCPCallResult {
  success: boolean;
  toolName: string;
  serverName: string;
  response: unknown;
  error?: string;
}

interface ConnectedServer {
  client: Client;
  transport: StdioClientTransport;
  config: MCPServerConfig;
}

export class MCPManager {
  private servers: Map<string, ConnectedServer> = new Map();
  private logger: Logger;
  private logsDir: string;
  private dryRun: boolean;

  constructor(logger: Logger, logsDir: string, dryRun: boolean) {
    this.logger = logger;
    this.logsDir = logsDir;
    this.dryRun = dryRun;
  }

  async connect(config: MCPServerConfig): Promise<void> {
    if (this.servers.has(config.name)) {
      this.logger.info('mcp_connect', `MCP server ${config.name} already connected`);
      return;
    }

    try {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env ? { ...process.env, ...config.env } as Record<string, string> : undefined,
      });

      const client = new Client({
        name: 'ai-employee-silver',
        version: '1.0.0',
      });

      await client.connect(transport);

      this.servers.set(config.name, { client, transport, config });
      this.logger.info('mcp_connect', `Connected to MCP server: ${config.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('mcp_connect_error', `Failed to connect to ${config.name}: ${msg}`, msg);
      createAlertFile('mcp_unreachable', config.name, `Cannot connect: ${msg}`, this.logsDir);
      throw err;
    }
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPCallResult> {
    const payloadSummary = JSON.stringify(args).substring(0, 200);

    if (this.dryRun) {
      this.logger.info('mcp_dryrun', `[DRY_RUN] Would call ${serverName}.${toolName} with: ${payloadSummary}`);
      logMCPCall(this.logger, serverName, toolName, payloadSummary, 'dry_run_skipped');
      return {
        success: true,
        toolName,
        serverName,
        response: { dryRun: true, message: `Would call ${toolName}` },
      };
    }

    const server = this.servers.get(serverName);
    if (!server) {
      const error = `MCP server ${serverName} not connected`;
      logMCPCall(this.logger, serverName, toolName, payloadSummary, 'failure', error);
      return { success: false, toolName, serverName, response: null, error };
    }

    // Retry logic
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await server.client.callTool({ name: toolName, arguments: args });

        logMCPCall(this.logger, serverName, toolName, payloadSummary, 'success');
        return {
          success: true,
          toolName,
          serverName,
          response: result,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn('mcp_retry', `${serverName}.${toolName} attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);

        if (attempt === MAX_RETRIES) {
          logMCPCall(this.logger, serverName, toolName, payloadSummary, 'failure', msg);
          createAlertFile('mcp_unreachable', serverName, `Tool ${toolName} failed after ${MAX_RETRIES} attempts: ${msg}`, this.logsDir);
          return { success: false, toolName, serverName, response: null, error: msg };
        }

        await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));
      }
    }

    // Should not reach here
    return { success: false, toolName, serverName, response: null, error: 'Unexpected retry exhaustion' };
  }

  async disconnect(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (server) {
      try {
        await server.client.close();
      } catch { /* ignore close errors */ }
      this.servers.delete(serverName);
      this.logger.info('mcp_disconnect', `Disconnected from MCP server: ${serverName}`);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const name of this.servers.keys()) {
      await this.disconnect(name);
    }
  }

  isConnected(serverName: string): boolean {
    return this.servers.has(serverName);
  }

  getConnectedServers(): string[] {
    return Array.from(this.servers.keys());
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
