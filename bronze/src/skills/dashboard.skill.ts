import { BaseSkill, SkillResult, ExecutionContext, makeSuccessResult } from './base-skill';
import { TaskFile } from '../models/task-file';
import fs from 'fs';
import path from 'path';

export class DashboardSkill implements BaseSkill {
  name = 'DashboardSkill';

  canHandle(task: TaskFile): boolean {
    return task.filename === '_dashboard_';
  }

  async execute(_task: TaskFile, context: ExecutionContext): Promise<SkillResult> {
    const vaultRoot = context.vaultRoot;
    const folders = [
      { name: 'Inbox', path: path.join(vaultRoot, 'Inbox') },
      { name: 'Needs Action', path: path.join(vaultRoot, 'Needs_Action') },
      { name: 'Plans', path: path.join(vaultRoot, 'Plans') },
      { name: 'Pending Approval', path: path.join(vaultRoot, 'Pending_Approval') },
      { name: 'Approved', path: path.join(vaultRoot, 'Approved') },
      { name: 'Done', path: path.join(vaultRoot, 'Done') },
    ];

    const counts = folders.map(f => {
      try {
        const files = fs.existsSync(f.path)
          ? fs.readdirSync(f.path).filter(name => name.endsWith('.md'))
          : [];
        return { name: f.name, count: files.length };
      } catch {
        return { name: f.name, count: 0 };
      }
    });

    // Read recent log entries
    const recentEntries = context.logger.getRecentEntries(10);
    const activityLines = recentEntries.length > 0
      ? recentEntries.map(e => `- ${e.timestamp} — [${e.level.toUpperCase()}] ${e.action}: ${e.detail}`).join('\n')
      : '- No activity yet.';

    const totalActive = counts.reduce((sum, c) => c.name !== 'Done' ? sum + c.count : sum, 0);
    const dashboardContent = `# Dashboard
**Updated**: ${new Date().toISOString()}
**Active Tasks**: ${totalActive}

| Folder | Count |
|--------|-------|
${counts.map(c => `| ${c.name} | ${c.count} |`).join('\n')}

## Recent Activity
${activityLines}
`;

    const dashboardPath = path.join(vaultRoot, 'Dashboard.md');
    if (!context.dryRun) {
      fs.writeFileSync(dashboardPath, dashboardContent, 'utf-8');
    }

    return makeSuccessResult('Dashboard updated', [], [dashboardPath]);
  }
}
