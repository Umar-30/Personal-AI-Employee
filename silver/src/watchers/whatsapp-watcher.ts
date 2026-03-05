import https from 'https';
import { BaseWatcher } from './base-watcher';
import { Logger } from '../../../bronze/src/logging/logger';
import { SilverTaskFrontmatter } from '../models/extended-frontmatter';

/**
 * Green API response types
 * Docs: https://green-api.com/en/docs/api/receiving/technology-http-api/
 */
interface GreenAPINotification {
  receiptId: number;
  body: {
    typeWebhook: string;
    instanceData: {
      idInstance: number;
      wid: string;
      typeInstance: string;
    };
    timestamp: number;
    idMessage: string;
    senderData?: {
      chatId: string;
      chatName: string;
      sender: string;
      senderName: string;
    };
    messageData?: {
      typeMessage: string;
      textMessageData?: {
        textMessage: string;
      };
      extendedTextMessageData?: {
        text: string;
      };
    };
  };
}

interface WhatsAppMessage {
  id: string;
  receiptId: number;
  sender: string;
  senderName: string;
  text: string;
  timestamp: number;
}

const PRIORITY_KEYWORDS = ['invoice', 'urgent', 'payment', 'asap', 'help', 'urgent', 'important', 'immediately'];

export class WhatsAppWatcher extends BaseWatcher {
  readonly source = 'whatsapp';

  private instanceId: string;
  private apiToken: string;
  private apiBaseUrl: string;

  constructor(
    needsActionDir: string,
    logsDir: string,
    pollIntervalMs: number,
    logger: Logger,
    instanceId: string,
    apiToken: string,
  ) {
    super(needsActionDir, logsDir, pollIntervalMs, logger);
    this.instanceId = instanceId;
    this.apiToken = apiToken;
    this.apiBaseUrl = `https://api.green-api.com/waInstance${instanceId}`;
  }

  protected async poll(): Promise<void> {
    this.logger.info('whatsapp_poll', 'Polling WhatsApp (Green API) for new messages');

    // Green API uses a queue-based notification system.
    // We receive one notification at a time, process it, then delete it.
    let processed = 0;
    const MAX_PER_POLL = 10; // Prevent infinite loop

    while (processed < MAX_PER_POLL) {
      const notification = await this.receiveNotification();
      if (!notification) break; // Queue empty

      const message = this.extractMessage(notification);

      if (message) {
        await this.handleMessage(message);
      }

      // Always delete notification from queue after processing
      await this.deleteNotification(notification.receiptId);
      processed++;
    }

    if (processed > 0) {
      this.logger.info('whatsapp_poll', `Processed ${processed} WhatsApp notification(s)`);
    }
  }

  private receiveNotification(): Promise<GreenAPINotification | null> {
    const url = `${this.apiBaseUrl}/receiveNotification/${this.apiToken}`;

    return new Promise((resolve, reject) => {
      const req = https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode === 200 && data && data !== 'null') {
              resolve(JSON.parse(data) as GreenAPINotification);
            } else {
              resolve(null); // No notifications in queue
            }
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy(new Error('Green API receive timeout'));
      });
    });
  }

  private deleteNotification(receiptId: number): Promise<void> {
    const url = `${this.apiBaseUrl}/deleteNotification/${this.apiToken}/${receiptId}`;

    return new Promise((resolve) => {
      const req = https.request(url, { method: 'DELETE' }, (res) => {
        res.resume(); // Drain response
        resolve();
      });
      req.on('error', () => resolve()); // Non-critical — resolve anyway
      req.end();
    });
  }

  private extractMessage(notification: GreenAPINotification): WhatsAppMessage | null {
    const { body } = notification;

    // Only process incoming text messages
    if (body.typeWebhook !== 'incomingMessageReceived') return null;
    if (!body.senderData || !body.messageData) return null;

    const typeMsg = body.messageData.typeMessage;
    if (typeMsg !== 'textMessage' && typeMsg !== 'extendedTextMessage') return null;

    const text =
      body.messageData.textMessageData?.textMessage ||
      body.messageData.extendedTextMessageData?.text ||
      '';

    if (!text.trim()) return null;

    return {
      id: body.idMessage,
      receiptId: notification.receiptId,
      sender: body.senderData.sender,
      senderName: body.senderData.senderName || body.senderData.chatName || body.senderData.sender,
      text,
      timestamp: body.timestamp,
    };
  }

  private async handleMessage(message: WhatsAppMessage): Promise<void> {
    const lowerText = message.text.toLowerCase();
    const hasKeyword = PRIORITY_KEYWORDS.some(kw => lowerText.includes(kw));
    const priority = hasKeyword ? 'high' : 'medium';

    const frontmatter: SilverTaskFrontmatter = {
      type: 'whatsapp_message',
      source: 'whatsapp',
      priority,
      status: 'pending',
      created: new Date(message.timestamp * 1000).toISOString(),
      source_id: message.id,
    };

    const detectedKeywords = PRIORITY_KEYWORDS.filter(kw => lowerText.includes(kw));
    const keywordNote = detectedKeywords.length > 0
      ? `\n**Priority Keywords Detected**: ${detectedKeywords.join(', ')}`
      : '';

    const body = [
      `# WhatsApp Message from ${message.senderName}`,
      '',
      `**From**: ${message.senderName} (${message.sender})`,
      `**Received**: ${new Date(message.timestamp * 1000).toISOString()}`,
      `**Priority**: ${priority}${keywordNote}`,
      '',
      '## Message Content',
      '',
      message.text,
      '',
      '## Suggested Actions',
      '',
      '- [ ] Review message and determine required action',
      '- [ ] Reply to sender if needed',
      '- [ ] Create follow-up tasks if applicable',
    ].join('\n');

    const slug = `whatsapp-${message.id}-${Date.now()}`;
    this.createTaskFile(frontmatter, body, slug);
  }
}
