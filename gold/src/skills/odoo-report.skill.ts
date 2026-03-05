import { BaseSkill, SkillResult, ExecutionContext, makeSuccessResult, makeErrorResult } from '../../../bronze/src/skills/base-skill';
import { TaskFile } from '../../../bronze/src/models/task-file';
import { MCPManager } from '../../../silver/src/mcp/mcp-manager';
import fs from 'fs';
import path from 'path';

export class OdooReportSkill implements BaseSkill {
  name = 'odoo-report';
  private mcpManager: MCPManager;

  constructor(mcpManager: MCPManager) {
    this.mcpManager = mcpManager;
  }

  canHandle(task: TaskFile): boolean {
    const body = task.body.toLowerCase();
    const type = task.frontmatter.type as string;
    return (
      type === 'financial_report' ||
      body.includes('outstanding invoices') ||
      body.includes('unpaid invoices') ||
      body.includes('financial summary') ||
      body.includes('accounting report') ||
      body.includes('show invoices') ||
      body.includes('list invoices')
    );
  }

  async execute(task: TaskFile, context: ExecutionContext): Promise<SkillResult> {
    const { logger, vaultRoot } = context;

    if (!this.mcpManager.isConnected('odoo')) {
      return makeErrorResult('Odoo MCP server not connected. Cannot generate financial report.');
    }

    // Query invoices from Odoo (read-only, no approval needed)
    const allResult = await this.mcpManager.callTool('odoo', 'list_invoices', { limit: 100 });
    if (!allResult.success) {
      return makeErrorResult(`Failed to query Odoo invoices: ${allResult.error}`);
    }

    const invoices = allResult.response as Array<{
      odooId: number; invoiceNumber: string; customer: string;
      total: number; status: string; dateDue: string | null;
    }>;

    // Categorize
    const draft = invoices.filter(i => i.status === 'draft');
    const posted = invoices.filter(i => i.status === 'posted');
    const paid = invoices.filter(i => i.status === 'paid' || i.status === 'in_payment');

    const totalOutstanding = posted.reduce((sum, i) => sum + (i.total || 0), 0);
    const totalDraft = draft.reduce((sum, i) => sum + (i.total || 0), 0);

    // Build report
    const date = new Date().toISOString().split('T')[0];
    const report = [
      `# Financial Report — ${date}`,
      '',
      `## Summary`,
      `- Total Invoices: ${invoices.length}`,
      `- Draft: ${draft.length} ($${totalDraft.toFixed(2)})`,
      `- Outstanding (Posted): ${posted.length} ($${totalOutstanding.toFixed(2)})`,
      `- Paid: ${paid.length}`,
      '',
    ];

    if (posted.length > 0) {
      report.push('## Outstanding Invoices');
      report.push('');
      report.push('| Invoice | Customer | Amount | Due Date |');
      report.push('|---------|----------|--------|----------|');
      for (const inv of posted) {
        report.push(`| ${inv.invoiceNumber} | ${inv.customer} | $${(inv.total || 0).toFixed(2)} | ${inv.dateDue || 'N/A'} |`);
      }
      report.push('');
    }

    if (draft.length > 0) {
      report.push('## Draft Invoices');
      report.push('');
      report.push('| Invoice | Customer | Amount |');
      report.push('|---------|----------|--------|');
      for (const inv of draft) {
        report.push(`| ${inv.invoiceNumber} | ${inv.customer} | $${(inv.total || 0).toFixed(2)} |`);
      }
      report.push('');
    }

    report.push('---');
    report.push('*Generated automatically by AI Employee Gold Tier*');

    const reportContent = report.join('\n');
    const reportsDir = path.join(vaultRoot, 'Briefings');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const filename = `${date}_Financial_Report.md`;
    const filepath = path.join(reportsDir, filename);
    fs.writeFileSync(filepath, reportContent, 'utf-8');

    logger.info('odoo_report_created', `Financial report written: ${filename}`, task.filename);

    return makeSuccessResult(`Financial report generated: ${filename}`, [filepath], []);
  }
}
