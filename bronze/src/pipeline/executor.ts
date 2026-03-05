import { PlanFile, markStepComplete, writePlanFile, parsePlanFile } from '../models/plan-file';
import { SkillRegistry } from '../skills/skill-registry';
import { ExecutionContext } from '../skills/base-skill';
import { parseTaskFile } from '../models/task-file';
import { createApprovalRequest } from '../models/approval-request';
import path from 'path';
import fs from 'fs';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export async function executeTaskPlan(
  plan: PlanFile,
  registry: SkillRegistry,
  context: ExecutionContext,
): Promise<void> {
  const { logger } = context;
  logger.info('executor_start', `Executing plan: ${plan.filename}`, plan.frontmatter.taskRef);

  // Find the task file for skill dispatch
  const taskPath = path.join(context.vaultRoot, 'Needs_Action', plan.frontmatter.taskRef);
  let task;
  try {
    task = fs.existsSync(taskPath) ? parseTaskFile(taskPath) : null;
  } catch {
    task = null;
  }

  let currentPlan = plan;

  for (const step of currentPlan.steps) {
    if (step.completed) continue;

    // Check if step is sensitive → route to approval
    if (step.risk === 'sensitive') {
      logger.info('executor_approval', `Step ${step.index} is sensitive: ${step.description}`, plan.frontmatter.taskRef);

      const pendingDir = path.join(context.vaultRoot, 'Pending_Approval');
      createApprovalRequest(
        plan.frontmatter.taskRef,
        plan.filename,
        step.index,
        step.description,
        'sensitive',
        `Executing: ${step.description}`,
        pendingDir,
      );

      logger.info('executor_approval', `Approval request created for step ${step.index}. Waiting for user action.`, plan.frontmatter.taskRef);
      // Stop execution — will resume when approval is detected
      return;
    }

    // Execute safe step with retries
    let success = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (context.dryRun) {
          logger.info('executor_dryrun', `[DRY_RUN] Would execute step ${step.index}: ${step.description}`, plan.frontmatter.taskRef);
          success = true;
          break;
        }

        if (task) {
          const result = await registry.dispatch(task, context);

          if (result.requiresApproval) {
            const pendingDir = path.join(context.vaultRoot, 'Pending_Approval');
            createApprovalRequest(
              plan.frontmatter.taskRef,
              plan.filename,
              step.index,
              step.description,
              result.approvalReason || 'Skill requires approval',
              `Executing: ${step.description}`,
              pendingDir,
            );
            logger.info('executor_approval', `Skill requested approval for step ${step.index}`, plan.frontmatter.taskRef);
            return;
          }

          if (result.success) {
            logger.info('step_complete', `Step ${step.index} completed: ${step.description}`, plan.frontmatter.taskRef);
            success = true;
            break;
          } else {
            throw new Error(result.error || 'Skill execution failed');
          }
        } else {
          // No task file available, just mark step as done
          logger.warn('executor_notask', `No task file for plan ${plan.filename}, marking step ${step.index} complete`, plan.frontmatter.taskRef);
          success = true;
          break;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('step_retry', `Step ${step.index} attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`, plan.frontmatter.taskRef);

        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await sleep(delay);
        } else {
          logger.error('step_failed', `Step ${step.index} failed after ${MAX_RETRIES} attempts: ${msg}`, msg, plan.frontmatter.taskRef);
        }
      }
    }

    if (success) {
      currentPlan = markStepComplete(currentPlan, step.index);
      writePlanFile(currentPlan);
    }
  }

  logger.info('executor_done', `Plan execution finished: ${plan.filename}`, plan.frontmatter.taskRef);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
