import { BaseSkill, SkillResult, ExecutionContext, makeSuccessResult, makeErrorResult } from './base-skill';
import { TaskFile } from '../models/task-file';

export class SummarizeSkill implements BaseSkill {
  name = 'SummarizeSkill';

  canHandle(task: TaskFile): boolean {
    const lower = task.body.toLowerCase();
    return lower.includes('summarize') || lower.includes('summary') || lower.includes('recap');
  }

  async execute(task: TaskFile, context: ExecutionContext): Promise<SkillResult> {
    context.logger.info('skill_execute', `${this.name}: Summarizing task ${task.filename}`, task.filename);

    const prompt = `You are an AI Employee. Summarize the following content concisely with key action items.

## Content to Summarize
${task.body}

Provide:
1. A brief summary (2-3 sentences)
2. Key action items (bulleted list)`;

    const response = await context.claudeClient.executeSkill(prompt);

    if (!response.success) {
      return makeErrorResult(response.error || 'Summarization failed');
    }

    return makeSuccessResult(response.text);
  }
}
