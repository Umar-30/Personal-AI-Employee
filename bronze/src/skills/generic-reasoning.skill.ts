import { BaseSkill, SkillResult, ExecutionContext, makeSuccessResult, makeErrorResult } from './base-skill';
import { TaskFile } from '../models/task-file';

export class GenericReasoningSkill implements BaseSkill {
  name = 'GenericReasoningSkill';

  canHandle(_task: TaskFile): boolean {
    // Fallback skill — handles everything
    return true;
  }

  async execute(task: TaskFile, context: ExecutionContext): Promise<SkillResult> {
    context.logger.info('skill_execute', `${this.name}: Processing task ${task.filename}`, task.filename);

    const prompt = `You are an AI Employee processing a task. Complete it and provide the result.

## Task
${task.body}

Provide a clear, structured response.`;

    const response = await context.claudeClient.executeSkill(prompt);

    if (!response.success) {
      return makeErrorResult(response.error || 'Claude CLI failed');
    }

    return makeSuccessResult(response.text);
  }
}
