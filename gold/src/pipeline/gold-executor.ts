import { PlanFile, markStepComplete, writePlanFile } from '../../../bronze/src/models/plan-file';
import { SkillRegistry } from '../../../bronze/src/skills/skill-registry';
import { ExecutionContext } from '../../../bronze/src/skills/base-skill';
import { parseTaskFile } from '../../../bronze/src/models/task-file';
import { createApprovalRequest } from '../../../bronze/src/models/approval-request';
import { MCPManager } from '../../../silver/src/mcp/mcp-manager';
import { classifySensitivity } from '../../../silver/src/pipeline/silver-executor';
import { AuditLogger } from '../logging/audit-logger';
import path from 'path';
import fs from 'fs';

export interface GoldExecutionContext extends ExecutionContext {
  mcpManager: MCPManager;
  auditLogger: AuditLogger;
  socialMediaManager?: import('../social/social-media-manager').SocialMediaManager;
}

export async function executeGoldTaskPlan(
  plan: PlanFile,
  registry: SkillRegistry,
  context: GoldExecutionContext,
): Promise<void> {
  const { logger, mcpManager, auditLogger } = context;
  const startTime = Date.now();

  logger.info('gold_executor_start', `Executing Gold plan: ${plan.filename}`, plan.frontmatter.taskRef);
  auditLogger.log({
    actor: 'gold-executor',
    action: 'plan_execution_start',
    parameters: { planFile: plan.filename, taskRef: plan.frontmatter.taskRef },
    approvalStatus: 'not_required',
    result: { success: true, detail: `Starting plan execution`, duration_ms: 0 },
    financial: null,
  });

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

    const stepStartTime = Date.now();

    // Check if step is sensitive → route to approval
    if (step.risk === 'sensitive') {
      logger.info('gold_executor_approval', `Step ${step.index} is sensitive: ${step.description}`, plan.frontmatter.taskRef);

      const pendingDir = path.join(context.vaultRoot, 'Pending_Approval');
      const approvalSlug = plan.frontmatter.taskRef.replace('.md', '');
      const approvalFile = path.join(pendingDir, `APPROVAL_${approvalSlug}_${step.index}.md`);

      // Skip if approval request already exists (prevents duplicate requests on re-runs)
      if (fs.existsSync(approvalFile)) {
        logger.info('gold_executor_approval', `Approval already pending for step ${step.index} — waiting`, plan.frontmatter.taskRef);
        return;
      }

      createApprovalRequest(
        plan.frontmatter.taskRef,
        plan.filename,
        step.index,
        step.description,
        'sensitive',
        buildApprovalImpact(step.description, mcpManager),
        pendingDir,
      );

      auditLogger.log({
        actor: 'gold-executor',
        action: 'approval_requested',
        parameters: { stepIndex: step.index, stepDescription: step.description },
        approvalStatus: 'approved',
        result: { success: true, detail: `Approval request created for step ${step.index}`, duration_ms: Date.now() - stepStartTime },
        financial: null,
      });

      return;
    }

    // Execute safe step with retries
    const maxRetries = context.dryRun ? 1 : 3;
    let success = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (context.dryRun) {
          logger.info('gold_executor_dryrun', `[DRY_RUN] Would execute step ${step.index}: ${step.description}`, plan.frontmatter.taskRef);
          success = true;
          break;
        }

        if (task) {
          const result = await registry.dispatch(task, context);

          if (result.requiresApproval) {
            const pendingDir = path.join(context.vaultRoot, 'Pending_Approval');
            const approvalSlug = plan.frontmatter.taskRef.replace('.md', '');
            const approvalFile = path.join(pendingDir, `APPROVAL_${approvalSlug}_${step.index}.md`);

            if (!fs.existsSync(approvalFile)) {
              createApprovalRequest(
                plan.frontmatter.taskRef,
                plan.filename,
                step.index,
                step.description,
                result.approvalReason || 'Skill requires approval',
                buildApprovalImpact(step.description, mcpManager),
                pendingDir,
              );
            }

            auditLogger.log({
              actor: 'gold-executor',
              action: 'skill_approval_requested',
              parameters: { stepIndex: step.index, reason: result.approvalReason },
              approvalStatus: 'approved',
              result: { success: true, detail: `Skill requested approval`, duration_ms: Date.now() - stepStartTime },
              financial: null,
            });

            return;
          }

          if (result.success) {
            logger.info('gold_step_complete', `Step ${step.index} completed: ${step.description}`, plan.frontmatter.taskRef);
            success = true;

            auditLogger.log({
              actor: 'gold-executor',
              action: 'step_completed',
              parameters: { stepIndex: step.index, stepDescription: step.description },
              approvalStatus: 'not_required',
              result: { success: true, detail: result.output, duration_ms: Date.now() - stepStartTime },
              financial: null,
            });

            break;
          } else {
            throw new Error(result.error || 'Skill execution failed');
          }
        } else {
          logger.warn('gold_executor_notask', `No task file for plan ${plan.filename}, marking step ${step.index} complete`, plan.frontmatter.taskRef);
          success = true;
          break;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('gold_step_retry', `Step ${step.index} attempt ${attempt}/${maxRetries} failed: ${msg}`, plan.frontmatter.taskRef);

        if (attempt < maxRetries) {
          await sleep(1000 * Math.pow(2, attempt - 1));
        } else {
          logger.error('gold_step_failed', `Step ${step.index} failed after ${maxRetries} attempts: ${msg}`, msg, plan.frontmatter.taskRef);

          auditLogger.log({
            actor: 'gold-executor',
            action: 'step_failed',
            parameters: { stepIndex: step.index, stepDescription: step.description, attempts: maxRetries },
            approvalStatus: 'not_required',
            result: { success: false, detail: msg, duration_ms: Date.now() - stepStartTime },
            financial: null,
          });
        }
      }
    }

    if (success) {
      currentPlan = markStepComplete(currentPlan, step.index);
      writePlanFile(currentPlan);
    }
  }

  auditLogger.log({
    actor: 'gold-executor',
    action: 'plan_execution_complete',
    parameters: { planFile: plan.filename },
    approvalStatus: 'not_required',
    result: { success: true, detail: `Plan execution finished`, duration_ms: Date.now() - startTime },
    financial: null,
  });

  logger.info('gold_executor_done', `Gold plan execution finished: ${plan.filename}`, plan.frontmatter.taskRef);
}

function buildApprovalImpact(stepDescription: string, mcpManager: MCPManager): string {
  const connectedServers = mcpManager.getConnectedServers();
  return `Executing: ${stepDescription}\nConnected MCP servers: ${connectedServers.join(', ') || 'none'}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
