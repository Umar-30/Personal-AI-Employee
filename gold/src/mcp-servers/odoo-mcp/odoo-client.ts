import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface OdooCredentials {
  url: string;
  database: string;
  username: string;
  apiKey: string;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: { message: string; code: number; data?: { message: string } };
}

export class OdooClient {
  private credentials: OdooCredentials;
  private uid: number | null = null;
  private requestId = 0;

  constructor(credentials: OdooCredentials) {
    this.credentials = credentials;
  }

  async authenticate(): Promise<number> {
    const result = await this.jsonRpc('/jsonrpc', {
      service: 'common',
      method: 'authenticate',
      args: [this.credentials.database, this.credentials.username, this.credentials.apiKey, {}],
    });

    if (typeof result !== 'number' || result === 0) {
      throw new Error('Odoo authentication failed: invalid credentials');
    }

    this.uid = result;
    return this.uid;
  }

  async execute(model: string, method: string, args: unknown[] = [], kwargs: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.uid) {
      await this.authenticate();
    }

    return this.jsonRpc('/jsonrpc', {
      service: 'object',
      method: 'execute_kw',
      args: [this.credentials.database, this.uid!, this.credentials.apiKey, model, method, args, kwargs],
    });
  }

  async searchRead(
    model: string,
    domain: unknown[] = [],
    fields: string[] = [],
    limit?: number,
    offset?: number,
  ): Promise<unknown[]> {
    const kwargs: Record<string, unknown> = { fields };
    if (limit !== undefined) kwargs.limit = limit;
    if (offset !== undefined) kwargs.offset = offset;

    const result = await this.execute(model, 'search_read', [domain], kwargs);
    return result as unknown[];
  }

  async create(model: string, values: Record<string, unknown>): Promise<number> {
    const result = await this.execute(model, 'create', [[values]]);
    return (result as number[])[0];
  }

  async read(model: string, ids: number[], fields: string[] = []): Promise<unknown[]> {
    return (await this.execute(model, 'read', [ids], { fields })) as unknown[];
  }

  async write(model: string, ids: number[], values: Record<string, unknown>): Promise<boolean> {
    return (await this.execute(model, 'write', [ids, values])) as boolean;
  }

  async callMethod(model: string, method: string, ids: number[]): Promise<unknown> {
    return this.execute(model, method, [ids]);
  }

  private async jsonRpc(endpoint: string, params: Record<string, unknown>): Promise<unknown> {
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: ++this.requestId,
      method: 'call',
      params,
    });

    const url = new URL(endpoint, this.credentials.url);
    const transport = url.protocol === 'https:' ? https : http;

    return new Promise<unknown>((resolve, reject) => {
      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const response: JsonRpcResponse = JSON.parse(data);
              if (response.error) {
                const errMsg = response.error.data?.message || response.error.message;
                reject(new Error(`Odoo JSON-RPC error: ${errMsg}`));
              } else {
                resolve(response.result);
              }
            } catch (e) {
              reject(new Error(`Failed to parse Odoo response: ${data.substring(0, 200)}`));
            }
          });
        },
      );

      req.on('error', (e) => reject(new Error(`Odoo connection error: ${e.message}`)));
      req.write(payload);
      req.end();
    });
  }
}
