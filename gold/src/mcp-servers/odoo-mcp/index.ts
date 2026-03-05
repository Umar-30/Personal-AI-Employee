import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { OdooClient } from './odoo-client';
import { createOdooTools } from './tools';

async function main() {
  const odooClient = new OdooClient({
    url: process.env.ODOO_URL || 'http://localhost:8069',
    database: process.env.ODOO_DATABASE || 'mycompany',
    username: process.env.ODOO_USERNAME || 'admin',
    apiKey: process.env.ODOO_API_KEY || '',
  });

  // Authenticate on startup
  try {
    await odooClient.authenticate();
    console.error('[odoo-mcp] Authenticated with Odoo successfully');
  } catch (err) {
    console.error(`[odoo-mcp] Failed to authenticate with Odoo: ${err}`);
    // Continue anyway — tools will fail individually with auth errors
  }

  const tools = createOdooTools(odooClient);

  const server = new Server(
    { name: 'odoo-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  // Call tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const toolArgs = (request.params.arguments || {}) as Record<string, unknown>;

    const tool = tools.find((t) => t.name === toolName);
    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
    }

    try {
      const result = await tool.handler(toolArgs);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: `Error: ${msg}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[odoo-mcp] Odoo MCP server running on stdio');
}

main().catch((err) => {
  console.error(`[odoo-mcp] Fatal error: ${err}`);
  process.exit(1);
});
