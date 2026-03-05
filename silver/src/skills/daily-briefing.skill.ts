import { BaseSkill, SkillResult, ExecutionContext, makeSuccessResult, makeErrorResult } from '../../../bronze/src/skills/base-skill';
import { TaskFile } from '../../../bronze/src/models/task-file';
import fs from 'fs';
import path from 'path';

export class DailyBriefingSkill implements BaseSkill {
  name = 'daily-briefing';

  canHandle(task: TaskFile): boolean {
    const body = task.body.toLowerCase();
    const type = task.frontmatter.type as string;
    return (
      type === 'scheduled' && body.includes('briefing') ||
      body.includes('daily briefing') ||
      body.includes('generate briefing') ||
      body.includes('executive summary')
    );
  }

  async execute(task: TaskFile, context: ExecutionContext): Promise<SkillResult> {
    const { logger, claudeClient, vaultRoot } = context;

    try {
      // Scan vault folders for counts
      const folderCounts = this.scanVaultFolders(vaultRoot);

      // Get recent activity from /Done
      const recentDone = this.getRecentFiles(path.join(vaultRoot, 'Done'), 5);

      // Get pending items
      const pendingItems = this.getRecentFiles(path.join(vaultRoot, 'Needs_Action'), 10);

      // Get pending approvals
      const pendingApprovals = this.getRecentFiles(path.join(vaultRoot, 'Pending_Approval'), 10);

      // Build briefing content
      const prompt = `Generate an executive daily briefing based on the following vault state.

## Vault Status
- Needs Action: ${folderCounts.needsAction} tasks
- Plans: ${folderCounts.plans} active plans
- Pending Approval: ${folderCounts.pendingApproval} items awaiting review
- Done: ${folderCounts.done} completed tasks

## Recent Completed Work
${recentDone.map(f => `- ${f}`).join('\n') || 'No recently completed tasks.'}

## Pending Tasks
${pendingItems.map(f => `- ${f}`).join('\n') || 'No pending tasks.'}

## Awaiting Approval
${pendingApprovals.map(f => `- ${f}`).join('\n') || 'No items awaiting approval.'}

${context.goals ? `## Business Goals\n${context.goals}` : ''}

## Instructions
Write a concise executive briefing with:
1. Status overview (1 paragraph)
2. Key highlights from completed work
3. Priority items requiring attention
4. Recommendations for today

Tone: Executive-level, analytical, concise, proactive.`;

      const response = await claudeClient.prompt(prompt);

      if (!response.success) {
        return makeErrorResult(`Failed to generate briefing: ${response.error}`);
      }

      // Write briefing file
      const date = new Date().toISOString().split('T')[0];
      const briefingsDir = path.join(vaultRoot, 'Briefings');
      if (!fs.existsSync(briefingsDir)) {
        fs.mkdirSync(briefingsDir, { recursive: true });
      }

      const filename = `${date}_Daily_Briefing.md`;
      const filepath = path.join(briefingsDir, filename);
      const content = `# Daily Executive Briefing — ${date}\n\n${response.text}\n\n---\n*Generated automatically by AI Employee Silver Tier*\n`;

      fs.writeFileSync(filepath, content, 'utf-8');

      logger.info('briefing_created', `Daily briefing written: ${filename}`, task.filename);

      return makeSuccessResult(`Daily briefing generated: ${filename}`, [filepath], []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return makeErrorResult(`Briefing generation failed: ${msg}`);
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
