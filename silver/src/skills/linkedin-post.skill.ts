import { BaseSkill, SkillResult, ExecutionContext, makeApprovalResult, makeSuccessResult, makeErrorResult } from '../../../bronze/src/skills/base-skill';
import { TaskFile } from '../../../bronze/src/models/task-file';
import { MCPManager } from '../mcp/mcp-manager';
import fs from 'fs';

const MAX_POST_LENGTH = 3000;

export class LinkedInPostSkill implements BaseSkill {
  name = 'linkedin-post';
  private mcpManager: MCPManager;

  constructor(mcpManager: MCPManager) {
    this.mcpManager = mcpManager;
  }

  canHandle(task: TaskFile): boolean {
    const body = task.body.toLowerCase();
    const type = task.frontmatter.type as string;
    return (
      type === 'linkedin_post' ||
      body.includes('linkedin post') ||
      body.includes('linkedin content') ||
      body.includes('publish on linkedin') ||
      body.includes('post to linkedin')
    );
  }

  async execute(task: TaskFile, context: ExecutionContext): Promise<SkillResult> {
    const { logger, claudeClient } = context;

    // Generate post content using Claude
    let businessContext = '';
    if (context.goals) {
      businessContext += `\n## Business Goals\n${context.goals}`;
    }
    if (context.handbook) {
      businessContext += `\n## Brand Voice Guidelines\n${context.handbook}`;
    }

    const prompt = `You are a professional LinkedIn content writer. Generate a sales-oriented LinkedIn post based on the following context.

## Task
${task.body}
${businessContext}

## Requirements
- Professional, engaging tone
- Include a clear call-to-action
- Maximum ${MAX_POST_LENGTH} characters
- Use relevant hashtags (2-4)
- Focus on value proposition and thought leadership
- No emojis unless the brand guidelines specify otherwise

Return ONLY the post text, no other commentary.`;

    const response = await claudeClient.prompt(prompt);

    if (!response.success) {
      return makeErrorResult(`Failed to generate LinkedIn post: ${response.error}`);
    }

    let postText = response.text.trim();
    if (postText.length > MAX_POST_LENGTH) {
      postText = postText.substring(0, MAX_POST_LENGTH - 3) + '...';
    }

    logger.info('linkedin_draft', `Generated LinkedIn post draft (${postText.length} chars)`, task.filename);

    // Always require approval for LinkedIn posts
    return makeApprovalResult(
      `LinkedIn Post Draft:\n\n${postText}\n\n---\nCharacters: ${postText.length}/${MAX_POST_LENGTH}\nApprove this post for publishing?`
    );
  }

  async executeMCPAction(postText: string): Promise<SkillResult> {
    if (!this.mcpManager.isConnected('linkedin')) {
      return makeErrorResult('LinkedIn MCP server not connected. Cannot publish post.');
    }

    const result = await this.mcpManager.callTool('linkedin', 'create_post', {
      content: postText,
    });

    if (result.success) {
      return makeSuccessResult(
        `LinkedIn post published successfully.`,
        [],
        [],
      );
    } else {
      return makeErrorResult(`Failed to publish LinkedIn post: ${result.error}`);
    }
  }
}
