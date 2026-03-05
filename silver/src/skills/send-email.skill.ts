import { BaseSkill, SkillResult, ExecutionContext, makeApprovalResult, makeSuccessResult, makeErrorResult } from '../../../bronze/src/skills/base-skill';
import { TaskFile } from '../../../bronze/src/models/task-file';
import { MCPManager } from '../mcp/mcp-manager';

export class SendEmailSkill implements BaseSkill {
  name = 'send-email';
  private mcpManager: MCPManager;

  constructor(mcpManager: MCPManager) {
    this.mcpManager = mcpManager;
  }

  canHandle(task: TaskFile): boolean {
    const body = task.body.toLowerCase();
    const type = task.frontmatter.type;
    return (
      type === 'email' ||
      body.includes('send email') ||
      body.includes('send an email') ||
      body.includes('reply to email') ||
      body.includes('email response')
    );
  }

  async execute(task: TaskFile, context: ExecutionContext): Promise<SkillResult> {
    const { logger } = context;

    // All email sending requires approval
    if (!this.mcpManager.isConnected('gmail')) {
      return makeErrorResult('Gmail MCP server not connected. Cannot send emails.');
    }

    // Extract email details from task body
    const emailDetails = this.parseEmailIntent(task.body);

    if (!emailDetails.to) {
      return makeApprovalResult(
        `Send email action detected but recipient unclear.\n\nTask: ${task.body.substring(0, 500)}\n\nPlease approve sending this email.`
      );
    }

    // Always require approval for sending
    return makeApprovalResult(
      `Send email to: ${emailDetails.to}\nSubject: ${emailDetails.subject}\n\nBody:\n${emailDetails.body}\n\nApprove this email?`
    );
  }

  async executeMCPAction(
    to: string,
    subject: string,
    body: string,
  ): Promise<SkillResult> {
    const result = await this.mcpManager.callTool('gmail', 'send_email', {
      to,
      subject,
      body,
    });

    if (result.success) {
      return makeSuccessResult(
        `Email sent successfully to ${to}. Subject: ${subject}`,
        [],
        [],
      );
    } else {
      return makeErrorResult(`Failed to send email: ${result.error}`);
    }
  }

  private parseEmailIntent(body: string): { to: string; subject: string; body: string } {
    // Extract email fields from task body using common patterns
    const toMatch = body.match(/(?:to|recipient|email):\s*(\S+@\S+)/i);
    const subjectMatch = body.match(/subject:\s*(.+)/i);

    return {
      to: toMatch ? toMatch[1] : '',
      subject: subjectMatch ? subjectMatch[1].trim() : 'Follow-up',
      body: body,
    };
  }
}
