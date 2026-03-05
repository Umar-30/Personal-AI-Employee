import { BaseSkill, SkillResult, ExecutionContext, makeSuccessResult, makeErrorResult } from '../../../bronze/src/skills/base-skill';
import { TaskFile } from '../../../bronze/src/models/task-file';
import { MCPManager } from '../../../silver/src/mcp/mcp-manager';
import fs from 'fs';
import path from 'path';

export class CEOBriefingSkill implements BaseSkill {
  name = 'ceo-briefing';
  private mcpManager: MCPManager;

  constructor(mcpManager: MCPManager) {
    this.mcpManager = mcpManager;
  }

  canHandle(task: TaskFile): boolean {
    const body = task.body.toLowerCase();
    const type = task.frontmatter.type as string;
    return (
      type === 'ceo_briefing' ||
      body.includes('ceo briefing') ||
      body.includes('monday briefing') ||
      body.includes('weekly briefing') ||
      body.includes('executive summary') ||
      (type === 'scheduled' && body.includes('weekly'))
    );
  }

  async execute(task: TaskFile, context: ExecutionContext): Promise<SkillResult> {
    const { logger, claudeClient, vaultRoot } = context;

    try {
      // 1. Read Business_Goals.md
      let businessGoals = '';
      const goalsPath = path.join(vaultRoot, 'Business_Goals.md');
      if (fs.existsSync(goalsPath)) {
        businessGoals = fs.readFileSync(goalsPath, 'utf-8');
      }

      // 2. Parse Bank_Transactions.md
      let bankData = '';
      const bankPath = path.join(vaultRoot, 'Bank_Transactions.md');
      if (fs.existsSync(bankPath)) {
        bankData = fs.readFileSync(bankPath, 'utf-8');
      }

      // 3. Scan /Done for completed tasks this week
      const doneDir = path.join(vaultRoot, 'Done');
      const completedTasks = this.getRecentFiles(doneDir, 20);

      // 4. Get vault status
      const folderCounts = this.scanVaultFolders(vaultRoot);

      // 5. Get pending items
      const pendingItems = this.getRecentFiles(path.join(vaultRoot, 'Needs_Action'), 10);
      const pendingApprovals = this.getRecentFiles(path.join(vaultRoot, 'Pending_Approval'), 10);

      // 6. Query Odoo for financial data (graceful degradation)
      let odooData = '';
      if (this.mcpManager.isConnected('odoo')) {
        try {
          const invoiceResult = await this.mcpManager.callTool('odoo', 'list_invoices', { limit: 20 });
          if (invoiceResult.success) {
            const raw = invoiceResult.response;
            const invoices: Array<{ invoiceNumber: string; customer: string; total: number; status: string }> =
              Array.isArray(raw) ? raw : [];
            const outstanding = invoices.filter(i => i.status === 'posted');
            const paid = invoices.filter(i => i.status === 'paid' || i.status === 'in_payment');
            const totalOutstanding = outstanding.reduce((s, i) => s + (i.total || 0), 0);
            const totalPaid = paid.reduce((s, i) => s + (i.total || 0), 0);

            odooData = `\n## Odoo Financial Data\n` +
              `- Outstanding Invoices: ${outstanding.length} ($${totalOutstanding.toFixed(2)})\n` +
              `- Paid Invoices: ${paid.length} ($${totalPaid.toFixed(2)})\n` +
              `- Total Invoices: ${invoices.length}\n`;

            if (outstanding.length > 0) {
              odooData += `\nOutstanding:\n` + outstanding.map(i =>
                `  - ${i.invoiceNumber}: ${i.customer} — $${(i.total || 0).toFixed(2)}`
              ).join('\n');
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          odooData = `\n## Odoo Financial Data\n**Data unavailable — Odoo offline**: ${msg}\n`;
          logger.warn('ceo_briefing_odoo_offline', `Odoo unreachable during briefing: ${msg}`, task.filename);
        }
      } else {
        odooData = '\n## Odoo Financial Data\n**Data unavailable — Odoo not connected**\n';
      }

      // 7. Build the briefing prompt
      const prompt = `Generate a comprehensive Monday Morning CEO Briefing based on the following data.

## Business Goals
${businessGoals || 'No business goals file found.'}

## Bank Transactions
${bankData || 'No bank transactions file found.'}
${odooData}

## Vault Status
- Needs Action: ${folderCounts.needsAction} tasks
- Plans: ${folderCounts.plans} active plans
- Pending Approval: ${folderCounts.pendingApproval} items awaiting review
- Done: ${folderCounts.done} completed tasks

## Completed Work This Week
${completedTasks.map(f => `- ${f}`).join('\n') || 'No tasks completed this week.'}

## Pending Tasks
${pendingItems.map(f => `- ${f}`).join('\n') || 'No pending tasks.'}

## Awaiting Approval
${pendingApprovals.map(f => `- ${f}`).join('\n') || 'No items awaiting approval.'}

## Instructions
Write a comprehensive Monday Morning CEO Briefing with these EXACT 5 sections:

### 1. Revenue Summary
Analyze income vs. expenses from bank transactions and Odoo data. Include key financial metrics.

### 2. Bottleneck Analysis
Identify operational bottlenecks from pending tasks and stalled workflows. ${completedTasks.length === 0 ? 'FLAG: No tasks completed this week — this is a productivity concern.' : ''}

### 3. Subscription Audit
Review recurring transactions from bank data. Identify any subscription waste or optimization opportunities.

### 4. Risk Assessment
Identify business risks based on outstanding invoices, pending approvals, and operational gaps.

### 5. Proactive Recommendations
Provide at least 3 actionable recommendations for the upcoming week.

Tone: Executive-level, analytical, concise, proactive. This is a business partner briefing, not a summary.`;

      const response = await claudeClient.prompt(prompt);
      if (!response.success) {
        return makeErrorResult(`Failed to generate CEO briefing: ${response.error}`);
      }

      // 8. Write briefing file
      const date = new Date().toISOString().split('T')[0];
      const briefingsDir = path.join(vaultRoot, 'Briefings');
      if (!fs.existsSync(briefingsDir)) {
        fs.mkdirSync(briefingsDir, { recursive: true });
      }

      const filename = `${date}_Monday_Briefing.md`;
      const filepath = path.join(briefingsDir, filename);
      const content = `# Monday Morning CEO Briefing — ${date}\n\n${response.text}\n\n---\n*Generated automatically by AI Employee Gold Tier*\n`;

      fs.writeFileSync(filepath, content, 'utf-8');

      logger.info('ceo_briefing_created', `CEO briefing written: ${filename}`, task.filename);

      return makeSuccessResult(`Weekly CEO briefing generated: ${filename}`, [filepath], []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return makeErrorResult(`CEO briefing generation failed: ${msg}`);
    }
  }

  private scanVaultFolders(vaultRoot: string): Record<string, number> {
    const count = (dir: string): number => {
      try {
        if (!fs.existsSync(dir)) return 0;
        return fs.readdirSync(dir).filter(f => f.endsWith('.md')).length;
      } catch { return 0; }
    };

    return {
      needsAction: count(path.join(vaultRoot, 'Needs_Action')),
      plans: count(path.join(vaultRoot, 'Plans')),
      pendingApproval: count(path.join(vaultRoot, 'Pending_Approval')),
      done: count(path.join(vaultRoot, 'Done')),
    };
  }

  private getRecentFiles(dir: string, limit: number): string[] {
    try {
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .slice(-limit)
        .map(f => f.replace('.md', ''));
    } catch { return []; }
  }
}
