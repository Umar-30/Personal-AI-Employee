import { PlanFile, markStepComplete, writePlanFile, parsePlanFile, isComplete } from '../../../bronze/src/models/plan-file';
import { SkillRegistry } from '../../../bronze/src/skills/skill-registry';
import { ExecutionContext } from '../../../bronze/src/skills/base-skill';
import { parseTaskFile, TaskFile } from '../../../bronze/src/models/task-file';
import { createApprovalRequest } from '../../../bronze/src/models/approval-request';
import { MCPManager, MCPCallResult } from '../mcp/mcp-manager';
import { Logger } from '../../../bronze/src/logging/logger';
import path from 'path';
import fs from 'fs';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export interface SilverExecutionContext extends ExecutionContext {
  mcpManager: MCPManager;
}

export function classifySensitivity(mcpServer: string, toolName: string): 'safe' | 'sensitive' {
  const readOnlyPatterns = [
    /^list_/,
    /^get_/,
    /^read_/,
    /^search_/,
    /^fetch_/,
  ];

  for (const pattern of readOnlyPatterns) {
    if (pattern.test(toolName)) {
      return 'safe';
    }
  }

  // Default: all write/send/post/create actions and unknowns are sensitive
  return 'sensitive';
}

export async function executeSilverTaskPlan(
  plan: PlanFile,
  registry: SkillRegistry,
  context: SilverExecutionContext,
): Promise<void> {
  const { logger, mcpManager } = context;
  logger.info('silver_executor_start', `Executing Silver plan: ${plan.filename}`, plan.frontmatter.taskRef);

  const taskPath = path.join(context.vaultRoot, 'Needs_Action', plan.frontmatter.taskRef);
  let task;
  try {
    task = fs.existsSync(taskPath) ? parseTaskFile(taskPath) : null;
  } catch {
    task = null;
  }

  let currentPlan = plan;

  for (let i = 0; i < currentPlan.steps.length; i++) {
    const step = currentPlan.steps[i];
    if (step.completed) continue;

    // Check if step is sensitive → route to approval
    if (step.risk === 'sensitive') {
      const pendingDir = path.join(context.vaultRoot, 'Pending_Approval');
      const approvedDir = path.join(context.vaultRoot, 'Approved');
      const slug = plan.frontmatter.taskRef.replace('.md', '');
      const approvalFilename = `APPROVAL_${slug}_${step.index}.md`;

      // Already approved — execute the approved action, then mark step complete
      if (fs.existsSync(path.join(approvedDir, approvalFilename))) {
        logger.info('silver_executor_approval', `Step ${step.index} was approved. Executing approved action...`, plan.frontmatter.taskRef);

        // For publish/post steps, call the MCP tool directly
        const isPublishStep = /publish|post to|send to/i.test(step.description);
        if (isPublishStep && task) {
          const published = await executeApprovedMCPPublish(task, context, logger);
          if (!published) {
            logger.error('silver_executor_approval', `Step ${step.index}: MCP publish failed — will retry on next scan.`, step.description, plan.frontmatter.taskRef);
            return; // Leave step incomplete; retry on next scan
          }
        }

        currentPlan = markStepComplete(currentPlan, step.index);
        writePlanFile(currentPlan);
        continue;
      }

      // Already pending — don't create duplicate
      if (fs.existsSync(path.join(pendingDir, approvalFilename))) {
        logger.info('silver_executor_approval', `Step ${step.index} already pending approval. Waiting.`, plan.frontmatter.taskRef);
        return;
      }

      logger.info('silver_executor_approval', `Step ${step.index} is sensitive: ${step.description}`, plan.frontmatter.taskRef);
      createApprovalRequest(
        plan.frontmatter.taskRef,
        plan.filename,
        step.index,
        step.description,
        'sensitive',
        buildApprovalImpact(step.description, mcpManager),
        pendingDir,
      );

      logger.info('silver_executor_approval', `Approval request created for step ${step.index}. Waiting for user action.`, plan.frontmatter.taskRef);
      return;
    }

    // Execute safe step with retries
    let success = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (context.dryRun) {
          logger.info('silver_executor_dryrun', `[DRY_RUN] Would execute step ${step.index}: ${step.description}`, plan.frontmatter.taskRef);
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
              buildApprovalImpact(step.description, mcpManager),
              pendingDir,
            );
            logger.info('silver_executor_approval', `Skill requested approval for step ${step.index}`, plan.frontmatter.taskRef);
            return;
          }

          if (result.success) {
            logger.info('silver_step_complete', `Step ${step.index} completed: ${step.description}`, plan.frontmatter.taskRef);
            success = true;
            break;
          } else {
            throw new Error(result.error || 'Skill execution failed');
          }
        } else {
          logger.warn('silver_executor_notask', `No task file for plan ${plan.filename}, marking step ${step.index} complete`, plan.frontmatter.taskRef);
          success = true;
          break;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('silver_step_retry', `Step ${step.index} attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`, plan.frontmatter.taskRef);

        if (attempt < MAX_RETRIES) {
          await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));
        } else {
          logger.error('silver_step_failed', `Step ${step.index} failed after ${MAX_RETRIES} attempts: ${msg}`, msg, plan.frontmatter.taskRef);
        }
      }
    }

    if (success) {
      currentPlan = markStepComplete(currentPlan, step.index);
      writePlanFile(currentPlan);
    }
  }

  logger.info('silver_executor_done', `Silver plan execution finished: ${plan.filename}`, plan.frontmatter.taskRef);
}

async function executeApprovedMCPPublish(
  task: TaskFile,
  context: SilverExecutionContext,
  logger: Logger,
): Promise<boolean> {
  const { claudeClient, mcpManager } = context;

  if (!mcpManager.isConnected('linkedin')) {
    logger.error('linkedin_publish', 'LinkedIn MCP server not connected — cannot publish', 'not connected');
    return false;
  }

  // Generate the post content via Claude
  const prompt = `You are a professional LinkedIn content writer. Generate a compelling LinkedIn post based on this task:

## Task
${task.body}

## Requirements
- Professional, engaging tone
- Include a clear call-to-action
- Maximum 3000 characters
- Use 2-4 relevant hashtags
- Focus on value proposition and thought leadership

Return ONLY the post text, no other commentary.`;

  logger.info('linkedin_publish', 'Generating LinkedIn post content via Claude...', task.filename);
  const response = await claudeClient.prompt(prompt);

  if (!response.success) {
    logger.error('linkedin_publish', `Failed to generate post content: ${response.error}`, response.error || '');
    return false;
  }

  let postText = response.text.trim();
  if (postText.length > 3000) {
    postText = postText.substring(0, 2997) + '...';
  }

  logger.info('linkedin_publish', `Posting to LinkedIn via MCP (${postText.length} chars)...`, task.filename);
  const result = await mcpManager.callTool('linkedin', 'create_post', { content: postText });

  if (result.success) {
    logger.info('linkedin_publish', 'LinkedIn post published successfully via MCP!', task.filename);
    return true;
  } else {
    logger.error('linkedin_publish', `LinkedIn MCP publish failed: ${result.error}`, result.error || '');
    return false;
  }
}

function buildApprovalImpact(stepDescription: string, mcpManager: MCPManager): string {
  const connectedServers = mcpManager.getConnectedServers();
  return `Executing: ${stepDescription}\nConnected MCP servers: ${connectedServers.join(', ') || 'none'}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
