import { BaseSkill, SkillResult, ExecutionContext, makeApprovalResult, makeSuccessResult, makeErrorResult } from '../../../bronze/src/skills/base-skill';
import { TaskFile } from '../../../bronze/src/models/task-file';
import { MCPManager } from '../../../silver/src/mcp/mcp-manager';

export class OdooInvoiceSkill implements BaseSkill {
  name = 'odoo-invoice';
  private mcpManager: MCPManager;

  constructor(mcpManager: MCPManager) {
    this.mcpManager = mcpManager;
  }

  canHandle(task: TaskFile): boolean {
    const body = task.body.toLowerCase();
    const type = task.frontmatter.type as string;
    return (
      type === 'odoo_invoice' ||
      body.includes('create invoice') ||
      body.includes('create an invoice') ||
      body.includes('draft invoice') ||
      body.includes('billing') ||
      body.includes('send invoice')
    );
  }

  async execute(task: TaskFile, context: ExecutionContext): Promise<SkillResult> {
    const { logger, claudeClient } = context;

    if (!this.mcpManager.isConnected('odoo')) {
      return makeErrorResult('Odoo MCP server not connected. Cannot create invoice.');
    }

    // Use Claude to parse invoice details from task body
    const parsePrompt = `Extract invoice details from the following task. Return JSON with these fields:
- customer: string (customer name)
- lineItems: array of { description: string, quantity: number, unitPrice: number }
- currency: string (default "USD")
- dateDue: string or null (YYYY-MM-DD format)

Task:
${task.body}

Return ONLY valid JSON, no other text.`;

    const parseResponse = await claudeClient.prompt(parsePrompt);
    if (!parseResponse.success) {
      return makeErrorResult(`Failed to parse invoice details: ${parseResponse.error}`);
    }

    let invoiceDetails;
    try {
      invoiceDetails = JSON.parse(parseResponse.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch {
      return makeErrorResult(`Failed to parse invoice JSON from Claude response: ${parseResponse.text.substring(0, 200)}`);
    }

    // Create draft invoice in Odoo
    const result = await this.mcpManager.callTool('odoo', 'create_invoice', {
      customer: invoiceDetails.customer,
      lineItems: invoiceDetails.lineItems,
      currency: invoiceDetails.currency || 'USD',
      dateDue: invoiceDetails.dateDue || undefined,
    });

    if (!result.success) {
      logger.error('odoo_invoice_failed', `Failed to create draft invoice: ${result.error}`, result.error || undefined, task.filename);
      return makeErrorResult(`Failed to create draft invoice in Odoo: ${result.error}`);
    }

    const invoice = result.response as { odooId: number; invoiceNumber: string; status: string; total: number };

    logger.info('odoo_invoice_drafted', `Draft invoice created: ${invoice.invoiceNumber} (Odoo ID: ${invoice.odooId}, Total: ${invoice.total})`, task.filename);

    // Calculate line items summary for approval
    const linesSummary = invoiceDetails.lineItems
      .map((item: { description: string; quantity: number; unitPrice: number }) =>
        `  - ${item.description}: ${item.quantity} x $${item.unitPrice} = $${item.quantity * item.unitPrice}`)
      .join('\n');

    return makeApprovalResult(
      `Odoo Invoice Draft Created:\n\n` +
      `Invoice Number: ${invoice.invoiceNumber}\n` +
      `Odoo ID: ${invoice.odooId}\n` +
      `Customer: ${invoiceDetails.customer}\n` +
      `Currency: ${invoiceDetails.currency || 'USD'}\n\n` +
      `Line Items:\n${linesSummary}\n\n` +
      `Total: $${invoice.total}\n` +
      `Status: DRAFT (not posted)\n\n` +
      `---\nApprove to POST this invoice in Odoo?`
    );
  }

  async executeMCPAction(odooId: number): Promise<SkillResult> {
    if (!this.mcpManager.isConnected('odoo')) {
      return makeErrorResult('Odoo MCP server not connected. Cannot post invoice.');
    }

    const result = await this.mcpManager.callTool('odoo', 'post_invoice', { odooId });

    if (result.success) {
      const posted = result.response as { odooId: number; status: string; invoiceNumber: string };
      return makeSuccessResult(
        `Invoice ${posted.invoiceNumber} posted successfully in Odoo (ID: ${posted.odooId}, Status: ${posted.status}).`,
        [],
        [],
      );
    } else {
      return makeErrorResult(`Failed to post invoice in Odoo: ${result.error}`);
    }
  }
}
