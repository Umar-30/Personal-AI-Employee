import { BaseWatcher } from './base-watcher';
import { Logger } from '../../../bronze/src/logging/logger';
import { MCPManager } from '../mcp/mcp-manager';
import { SilverTaskFrontmatter } from '../models/extended-frontmatter';

export class GmailWatcher extends BaseWatcher {
  readonly source = 'gmail';
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
    this.logger.info('gmail_poll', `Polling Gmail for new emails since ${this.state.lastChecked}`);

    if (!this.mcpManager.isConnected('gmail')) {
      throw new Error('Gmail MCP server not connected');
    }

    // Query Gmail for unread messages since last check
    const result = await this.mcpManager.callTool('gmail', 'search_emails', {
      query: `is:unread after:${this.getSearchDate()}`,
      maxResults: 10,
    });

    if (!result.success) {
      throw new Error(result.error || 'Gmail search failed');
    }

    const messages = this.extractMessages(result.response);
    this.logger.info('gmail_poll', `Found ${messages.length} new emails`);

    for (const msg of messages) {
      const frontmatter: SilverTaskFrontmatter = {
        type: 'email',
        source: 'gmail',
        priority: 'medium',
        status: 'pending',
        created: new Date().toISOString(),
        source_id: msg.id,
      };

      const body = `# Email: ${msg.subject}\n\n**From**: ${msg.from}\n**Date**: ${msg.date}\n\n${msg.body}`;
      const slug = `email-${msg.id}-${Date.now()}`;

      this.createTaskFile(frontmatter, body, slug);
    }
  }

  private getSearchDate(): string {
    // Gmail search uses YYYY/MM/DD format
    const date = new Date(this.state.lastChecked);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
  }

  private extractMessages(response: unknown): Array<{ id: string; subject: string; from: string; date: string; body: string }> {
    // MCP response format varies by server implementation.
    // Handle both array and object responses gracefully.
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
              subject: String(m.subject || 'No Subject'),
              from: String(m.from || m.sender || 'Unknown'),
              date: String(m.date || m.receivedAt || ''),
              body: String(m.body || m.snippet || m.text || ''),
            }));
          }
        }
      }

      // Direct array response
      if (Array.isArray(response)) {
        return (response as any[]).map(m => ({
          id: String(m.id || ''),
          subject: String(m.subject || 'No Subject'),
          from: String(m.from || 'Unknown'),
          date: String(m.date || ''),
          body: String(m.body || m.snippet || ''),
        }));
      }
    } catch {
      this.logger.warn('gmail_parse', 'Failed to parse Gmail MCP response');
    }

    return [];
  }
}
