import execa from 'execa';

export interface ClaudeResponse {
  success: boolean;
  text: string;
  error?: string;
}

export class ClaudeClient {
  private dryRun: boolean;

  constructor(dryRun: boolean = false) {
    this.dryRun = dryRun;
  }

  async prompt(input: string): Promise<ClaudeResponse> {
    if (this.dryRun) {
      return {
        success: true,
        text: `[DRY_RUN] Would send prompt: ${input.substring(0, 100)}...`,
      };
    }

    try {
      const result = await execa('claude', ['--print'], {
        input,
        timeout: 120000,
      });

      return {
        success: true,
        text: result.stdout,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        text: '',
        error: `Claude CLI error: ${message}`,
      };
    }
  }

  async planTask(taskBody: string, handbookContent?: string): Promise<ClaudeResponse> {
    const prompt = this.buildPlanPrompt(taskBody, handbookContent);
    return this.prompt(prompt);
  }

  async executeSkill(skillPrompt: string): Promise<ClaudeResponse> {
    return this.prompt(skillPrompt);
  }

  private buildPlanPrompt(taskBody: string, handbook?: string): string {
    let prompt = `You are an AI Employee processing a task. Create an execution plan with checkbox steps.

## Task
${taskBody}
`;

    if (handbook) {
      prompt += `
## Company Handbook Rules
${handbook}
`;
    }

    prompt += `
## Instructions
1. Analyze the task objective.
2. Determine if any steps are sensitive (payments, emails to new contacts, irreversible actions).
3. Return a numbered list of checkbox steps in this format:
   - [ ] Step N: <description> [safe] or [sensitive]

Return ONLY the step list, no other text.`;

    return prompt;
  }
}
