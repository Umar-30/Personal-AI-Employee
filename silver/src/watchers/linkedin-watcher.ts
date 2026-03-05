import { BaseWatcher } from './base-watcher';
import { Logger } from '../../../bronze/src/logging/logger';
import { MCPManager } from '../mcp/mcp-manager';
import { SilverTaskFrontmatter } from '../models/extended-frontmatter';

export class LinkedInWatcher extends BaseWatcher {
  readonly source = 'linkedin';
  private mcpManager: MCPManager;

  constructor(
    needsActionDir: string,
    logsDir: string,
    pollIntervalMs: number,
    logger: Logger,
    mcpManager: MCPManager,
  ) {
    super(needsActionDir, logsDir, pollIntervalMs, logger);
    this.mcpManager = mcpManager;
  }

  protected async poll(): Promise<void> {
    this.logger.info('linkedin_poll', `Polling LinkedIn for new messages since ${this.state.lastChecked}`);

    if (!this.mcpManager.isConnected('linkedin')) {
      throw new Error('LinkedIn MCP server not connected');
    }

    const result = await this.mcpManager.callTool('linkedin', 'get_messages', {
      since: this.state.lastChecked,
      limit: 10,
    });

    if (!result.success) {
      throw new Error(result.error || 'LinkedIn message fetch failed');
    }

    const messages = this.extractMessages(result.response);
    this.logger.info('linkedin_poll', `Found ${messages.length} new LinkedIn messages`);

    for (const msg of messages) {
      const frontmatter: SilverTaskFrontmatter = {
        type: 'linkedin_message',
        source: 'linkedin',
        priority: 'medium',
        status: 'pending',
        created: new Date().toISOString(),
        source_id: msg.id,
      };

      const body = `# LinkedIn Message\n\n**From**: ${msg.from}\n**Date**: ${msg.date}\n\n${msg.text}`;
      const slug = `linkedin-${msg.id}-${Date.now()}`;

      this.createTaskFile(frontmatter, body, slug);
    }
  }

  private extractMessages(response: unknown): Array<{ id: string; from: string; date: string; text: string }> {
    if (!response) return [];

    try {
      const data = response as Record<string, unknown>;

      // Handle standard MCP tool result format
      if (data.content && Array.isArray(data.content)) {
        const textContent = data.content.find((c: any) => c.type === 'text');
        if (textContent && typeof textContent.text === 'string') {
          const parsed = JSON.parse(textContent.text);
          if (Array.isArray(parsed)) {
            return parsed.map((m: any) => ({
              id: String(m.id || m.messageId || ''),
              from: String(m.from || m.sender || m.senderName || 'Unknown'),
              date: String(m.date || m.timestamp || ''),
              text: String(m.text || m.body || m.message || ''),
            }));
          }
        }
      }

      if (Array.isArray(response)) {
        return (response as any[]).map(m => ({
          id: String(m.id || ''),
          from: String(m.from || 'Unknown'),
          date: String(m.date || ''),
          text: String(m.text || m.body || ''),
        }));
      }
    } catch {
      this.logger.warn('linkedin_parse', 'Failed to parse LinkedIn MCP response');
    }

    return [];
  }
}
