import path from 'path';
import { parseTaskFile, updateTaskStatus, writeTaskFile, slugFromFilename } from '../models/task-file';
import { createPlanFile, PlanFile, RiskLevel } from '../models/plan-file';
import { ClaudeClient } from '../claude/claude-client';
import { Logger } from '../logging/logger';

export async function planTask(
  taskPath: string,
  plansDir: string,
  claudeClient: ClaudeClient,
  logger: Logger,
  handbook?: string,
): Promise<PlanFile | null> {
  const task = parseTaskFile(taskPath);
  const slug = slugFromFilename(task.filename);

  logger.info('plan_create', `Creating plan for: ${task.filename}`, task.filename);

  // Update status to in_progress
  const updatedTask = updateTaskStatus(task, 'in_progress');
  writeTaskFile(updatedTask, path.dirname(taskPath));

  // Ask Claude to generate a plan
  const response = await claudeClient.planTask(task.body, handbook);

  if (!response.success) {
    logger.error('plan_create', `Claude failed for ${task.filename}: ${response.error}`, response.error, task.filename);
    return null;
  }

  // Parse Claude's response into steps
  const steps = parseStepsFromResponse(response.text);

  if (steps.length === 0) {
    // Fallback: create a simple single-step plan
    steps.push({ description: `Process task: ${task.body.substring(0, 100)}`, risk: 'safe' as RiskLevel });
  }

  const plan = createPlanFile(slug, `Plan: ${slug}`, steps, plansDir);
  logger.info('plan_created', `Plan created: ${plan.filename} (${plan.steps.length} steps)`, task.filename);

  return plan;
}

function parseStepsFromResponse(text: string): Array<{ description: string; risk: RiskLevel }> {
  const steps: Array<{ description: string; risk: RiskLevel }> = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const match = line.match(/^- \[ \] Step \d+: (.+?) \[(safe|sensitive).*\]/i);
    if (match) {
      steps.push({
        description: match[1].trim(),
        risk: match[2].toLowerCase() as RiskLevel,
      });
      continue;
    }

    // Also match numbered lists without checkbox format
    const altMatch = line.match(/^\d+\.\s+(.+)/);
    if (altMatch) {
      const desc = altMatch[1].trim();
      const isSensitive = /\b(send|pay|email|post|delete|remove)\b/i.test(desc);
      steps.push({
        description: desc,
        risk: isSensitive ? 'sensitive' : 'safe',
      });
    }
  }

  return steps;
}
