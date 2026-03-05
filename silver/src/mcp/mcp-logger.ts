import { Logger } from '../../../bronze/src/logging/logger';

export function logMCPCall(
  logger: Logger,
  serverName: string,
  toolName: string,
  payloadSummary: string,
  status: 'success' | 'failure' | 'dry_run_skipped',
  error?: string,
): void {
  const detail = `MCP ${serverName}.${toolName} → ${status}` + (error ? ` (${error})` : '');
  const level = status === 'failure' ? 'error' : 'info';

  if (level === 'error') {
    logger.error('mcp_call', detail, error);
  } else {
    logger.info('mcp_call', detail);
  }

  // Extended log entry with MCP metadata written via the logger's standard mechanism.
  // The Logger writes JSON-line entries. Additional MCP fields are included in the detail string.
  logger.log(level === 'error' ? 'error' : 'info', 'mcp_call_detail', JSON.stringify({
    mcpServer: serverName,
    mcpTool: toolName,
    mcpPayload: payloadSummary,
    mcpResponseStatus: status,
    error: error || null,
  }), { outcome: status === 'failure' ? 'failure' : 'success', error });
}
