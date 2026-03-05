import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export interface ApprovalFrontmatter {
  taskRef: string;
  planRef: string;
  stepNumber: number;
  action: string;
  riskLevel: string;
  impact: string;
  created: string;
}

export interface ApprovalRequest {
  filename: string;
  filepath: string;
  frontmatter: ApprovalFrontmatter;
  body: string;
}

export function createApprovalRequest(
  taskRef: string,
  planRef: string,
  stepNumber: number,
  action: string,
  riskLevel: string,
  impact: string,
  pendingDir: string,
): ApprovalRequest {
  const slug = taskRef.replace('.md', '');
  const filename = `APPROVAL_${slug}_${stepNumber}.md`;
  const filepath = path.join(pendingDir, filename);

  const frontmatter: ApprovalFrontmatter = {
    taskRef,
    planRef,
    stepNumber,
    action,
    riskLevel,
    impact,
    created: new Date().toISOString(),
  };

  const body = `# Approval Required

**Action**: ${action}
**Risk Level**: ${riskLevel}
**Impact**: ${impact}

## Instructions

- **To approve**: Move this file to the \`/Approved\` folder.
- **To reject**: Move this file to the \`/Rejected\` folder.

The AI Employee will detect your decision and proceed accordingly.
`;

  const content = matter.stringify(body, frontmatter as unknown as Record<string, unknown>);

  if (!fs.existsSync(pendingDir)) {
    fs.mkdirSync(pendingDir, { recursive: true });
  }
  fs.writeFileSync(filepath, content, 'utf-8');

  return { filename, filepath, frontmatter, body };
}

export function parseApprovalRequest(filepath: string): ApprovalRequest {
  const raw = fs.readFileSync(filepath, 'utf-8');
  const parsed = matter(raw);

  return {
    filename: path.basename(filepath),
    filepath,
    frontmatter: parsed.data as ApprovalFrontmatter,
    body: parsed.content,
  };
}
