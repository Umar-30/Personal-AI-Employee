import { PlanFile, markStepComplete, writePlanFile, parsePlanFile } from '../../../bronze/src/models/plan-file';
import { SkillRegistry } from '../../../bronze/src/skills/skill-registry';
import { Logger } from '../../../bronze/src/logging/logger';
import { createAlertFile, AlertType } from '../../../silver/src/models/alert-file';
import fs from 'fs';
import path from 'path';

export interface CompletionCondition {
  type: 'plan_complete' | 'file_moved' | 'promise_emitted';
  satisfied: boolean;
  detail: string;
}

export interface PersistenceLoopState {
  taskRef: string;
  planRef: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  currentIteration: number;
  lastProgressTimestamp: string;
  stallTimeoutMs: number;
  isStalled: boolean;
  completionConditions: CompletionCondition[];
}

export interface PersistenceConfig {
  stallTimeoutMs: number;
  maxRetries: number;
  retryBackoffMs: number;
}

export class PersistenceLoop {
  private state: PersistenceLoopState;
  private config: PersistenceConfig;
  private logger: Logger;
  private vaultRoot: string;
  private externalCompletion = false;

  constructor(config: PersistenceConfig, logger: Logger, vaultRoot: string) {
    this.config = config;
    this.logger = logger;
    this.vaultRoot = vaultRoot;
    this.state = {
      taskRef: '',
      planRef: '',
      totalSteps: 0,
      completedSteps: 0,
      failedSteps: 0,
      currentIteration: 0,
      lastProgressTimestamp: new Date().toISOString(),
      stallTimeoutMs: config.stallTimeoutMs,
      isStalled: false,
      completionConditions: [],
    };
  }

  async start(
    taskRef: string,
    planRef: string,
    executeStep: (plan: PlanFile, stepIndex: number) => Promise<{ success: boolean; requiresApproval?: boolean }>,
  ): Promise<void> {
    this.state.taskRef = taskRef;
    this.state.planRef = planRef;

    this.logger.info('persistence_loop_start', `Starting persistence loop for ${taskRef}`, taskRef);

    // Initialize completion conditions
    this.state.completionConditions = [
      { type: 'plan_complete', satisfied: false, detail: 'All plan steps completed' },
      { type: 'file_moved', satisfied: false, detail: `Task file moved to /Done` },
    ];

    let plan = parsePlanFile(planRef);
    this.state.totalSteps = plan.steps.length;

    while (!this.isComplete()) {
      this.state.currentIteration++;

      // Re-read plan file (may have been updated externally)
      try {
        plan = parsePlanFile(planRef);
      } catch {
        this.logger.warn('persistence_plan_read_error', `Could not re-read plan file: ${planRef}`, taskRef);
      }

      // Find next uncompleted step
      const nextStep = plan.steps.find(s => !s.completed);
      if (!nextStep) {
        this.state.completionConditions[0].satisfied = true;
        this.logger.info('persistence_all_steps_done', `All plan steps completed`, taskRef);
        break;
      }

      // Execute step with retries
      let stepSuccess = false;
      for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
        try {
          const result = await executeStep(plan, nextStep.index);

          if (result.requiresApproval) {
            this.logger.info('persistence_approval_wait', `Step ${nextStep.index} requires approval. Pausing loop.`, taskRef);
            // Don't break the loop — we'll wait for approval on next iteration
            this.state.lastProgressTimestamp = new Date().toISOString();
            return; // Exit loop — will resume when approval is processed
          }

          if (result.success) {
            stepSuccess = true;
            this.state.completedSteps++;
            this.state.lastProgressTimestamp = new Date().toISOString();
            this.state.isStalled = false;
            this.logger.info('persistence_step_done', `Step ${nextStep.index} completed (iteration ${this.state.currentIteration})`, taskRef);
            break;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn('persistence_step_retry', `Step ${nextStep.index} attempt ${attempt}/${this.config.maxRetries}: ${msg}`, taskRef);

          if (attempt < this.config.maxRetries) {
            await this.sleep(this.config.retryBackoffMs * Math.pow(2, attempt - 1));
          }
        }
      }

      if (!stepSuccess) {
        this.state.failedSteps++;
        this.logger.error('persistence_step_failed', `Step ${nextStep.index} failed after ${this.config.maxRetries} retries`, undefined, taskRef);
        // Continue to next step — don't terminate
      }

      // Check stall timeout
      const elapsed = Date.now() - new Date(this.state.lastProgressTimestamp).getTime();
      if (elapsed > this.config.stallTimeoutMs && !this.state.isStalled) {
        this.state.isStalled = true;
        this.logger.warn('persistence_stall_detected', `No progress for ${elapsed}ms — stall detected`, taskRef);
        createAlertFile(
          'mcp_unreachable' as AlertType,
          `persistence-loop:${taskRef}`,
          `Task ${taskRef} stalled: no progress for ${Math.round(elapsed / 1000)}s. Iteration: ${this.state.currentIteration}`,
          path.join(this.vaultRoot, 'Logs'),
        );
        // Do NOT terminate — just alert
      }

      // Check file-based completion
      this.checkFileCompletion();
    }

    this.logger.info('persistence_loop_done', `Persistence loop completed for ${taskRef} after ${this.state.currentIteration} iterations`, taskRef);
  }

  isComplete(): boolean {
    if (this.externalCompletion) return true;

    // Complete if all plan steps done
    if (this.state.completionConditions[0]?.satisfied) return true;

    // Complete if file moved to /Done
    if (this.state.completionConditions[1]?.satisfied) return true;

    return false;
  }

  getState(): PersistenceLoopState {
    return { ...this.state };
  }

  signalCompletion(conditionType: CompletionCondition['type']): void {
    if (conditionType === 'promise_emitted') {
      this.externalCompletion = true;
      return;
    }

    const condition = this.state.completionConditions.find(c => c.type === conditionType);
    if (condition) {
      condition.satisfied = true;
    }
  }

  private checkFileCompletion(): void {
    // Check if task file has been moved to /Done
    const doneDir = path.join(this.vaultRoot, 'Done');
    if (fs.existsSync(doneDir)) {
      const doneFiles = fs.readdirSync(doneDir);
      const taskBasename = path.basename(this.state.taskRef);
      if (doneFiles.includes(taskBasename)) {
        this.state.completionConditions[1].satisfied = true;
        this.logger.info('persistence_file_moved', `Task file detected in /Done`, this.state.taskRef);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
