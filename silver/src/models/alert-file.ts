import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export type AlertType = 'auth_failure' | 'mcp_unreachable' | 'rate_limit' | 'content_rejected';

export interface AlertFrontmatter {
  type: AlertType;
  source: string;
  created: string;
  resolved: boolean;
}

export function createAlertFile(
  type: AlertType,
  source: string,
  description: string,
  logsDir: string,
): string {
  const alertsDir = path.join(logsDir, 'alerts');
  if (!fs.existsSync(alertsDir)) {
    fs.mkdirSync(alertsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const slug = `${type}_${source}_${timestamp.replace(/[:.]/g, '-')}`;
  const filename = `ALERT_${slug}.md`;
  const filepath = path.join(alertsDir, filename);

  const frontmatter: AlertFrontmatter = {
    type,
    source,
    created: timestamp,
    resolved: false,
  };

  const body = `# Alert: ${type}\n\n**Source**: ${source}\n**Time**: ${timestamp}\n\n## Description\n\n${description}\n\n## Recommended Action\n\nCheck ${source} credentials and connectivity. Resolve the issue and mark this alert as resolved.\n`;

  const content = matter.stringify(body, frontmatter as unknown as Record<string, unknown>);
  fs.writeFileSync(filepath, content, 'utf-8');

  return filepath;
}

export function resolveAlert(filepath: string): void {
  const raw = fs.readFileSync(filepath, 'utf-8');
  const parsed = matter(raw);
  parsed.data.resolved = true;
  const content = matter.stringify(parsed.content, parsed.data);
  fs.writeFileSync(filepath, content, 'utf-8');
}
