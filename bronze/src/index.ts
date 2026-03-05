import { loadConfig, AppConfig } from './config/config';
import { Logger } from './logging/logger';
import { InboxWatcher } from './watcher/inbox-watcher';
import { processIntake } from './pipeline/intake';
import { ClaudeClient } from './claude/claude-client';
import { SkillRegistry } from './skills/skill-registry';
import { ExecutionContext } from './skills/base-skill';
import { planTask } from './pipeline/planner';
import { executeTaskPlan } from './pipeline/executor';
import { completeTask } from './pipeline/completer';
import { ApprovalWatcher } from './approval/approval-watcher';
import { SummarizeSkill } from './skills/summarize.skill';
import { DraftEmailSkill } from './skills/draft-email.skill';
import { GenericReasoningSkill } from './skills/generic-reasoning.skill';
import { DashboardSkill } from './skills/dashboard.skill';
import { parsePlanFile, isComplete } from './models/plan-file';
import { parseTaskFile } from './models/task-file';
import fs from 'fs';
import path from 'path';

class AIDaemon {
  private config: AppConfig;
  private logger: Logger;
  private inboxWatcher: InboxWatcher;
  private approvalWatcher: ApprovalWatcher | null = null;
  private claudeClient: ClaudeClient;
  private skillRegistry: SkillRegistry;
  private context!: ExecutionContext;
  private taskQueue: string[] = [];
  private processing = false;

  constructor() {
    this.config = loadConfig();
    this.logger = new Logger(this.config.folders.logs, this.config.logLevel);
    this.claudeClient = new ClaudeClient(this.config.dryRun);
    this.skillRegistry = new SkillRegistry();

    // T026: Register built-in skills
    this.skillRegistry.register(new SummarizeSkill(), 10);
    this.skillRegistry.register(new DraftEmailSkill(), 20);
    this.skillRegistry.register(new DashboardSkill(), 100);
    this.skillRegistry.register(new GenericReasoningSkill(), 999);

    // T017: Wire inbox watcher to intake
    this.inboxWatcher = new InboxWatcher(
      this.config.folders.inbox,
      this.logger,
      (filepath) => this.enqueueTask(filepath),
    );
  }

  private buildContext(): ExecutionContext {
    let handbook: string | null = null;
    let goals: string | null = null;

    try {
      if (fs.existsSync(this.config.files.handbook)) {
        handbook = fs.readFileSync(this.config.files.handbook, 'utf-8');
      }
    } catch { /* ignore */ }

    try {
      if (fs.existsSync(this.config.files.goals)) {
        goals = fs.readFileSync(this.config.files.goals, 'utf-8');
      }
    } catch { /* ignore */ }

    return {
      vaultRoot: this.config.vaultPath,
      logger: this.logger,
      claudeClient: this.claudeClient,
      dryRun: this.config.dryRun,
      handbook,
      goals,
    };
  }

  private enqueueTask(filepath: string): void {
    this.taskQueue.push(filepath);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.taskQueue.length > 0) {
      const filepath = this.taskQueue.shift()!;
      await processIntake(filepath, this.config.folders.needsAction, this.logger);
      await this.updateDashboard();
    }

    this.processing = false;
  }

  private async scanAndProcess(): Promise<void> {
    // Scan /Needs_Action for unprocessed tasks
    const needsActionDir = this.config.folders.needsAction;
    if (!fs.existsSync(needsActionDir)) return;

    const files = fs.readdirSync(needsActionDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filepath = path.join(needsActionDir, file);
      try {
        const task = parseTaskFile(filepath);
        if (task.frontmatter.status === 'pending') {
          await this.processTask(task.filepath);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('scan_error', `Error reading ${file}: ${msg}`, msg, file);
      }
    }

    // T035: Resume incomplete plans
    await this.resumeIncompletePlans();
  }

  private async processTask(taskPath: string): Promise<void> {
    const filename = path.basename(taskPath);
    this.logger.info('task_process', `Processing task: ${filename}`, filename);

    try {
      // Plan
      const plan = await planTask(taskPath, this.config.folders.plans, this.claudeClient, this.logger, this.context.handbook ?? undefined);

      if (!plan) {
        this.logger.error('task_process', `Failed to create plan for ${filename}`, 'Planning failed', filename);
        return;
      }

      // Execute
      await executeTaskPlan(plan, this.skillRegistry, this.context);

      // Complete if all steps done
      const updatedPlan = parsePlanFile(plan.filepath);
      if (isComplete(updatedPlan)) {
        await completeTask(taskPath, updatedPlan.filepath, this.config.folders.done, this.logger);
      }

      await this.updateDashboard();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('task_process', `Error processing ${filename}: ${msg}`, msg, filename);
    }
  }

  private async resumeIncompletePlans(): Promise<void> {
    const plansDir = this.config.folders.plans;
    if (!fs.existsSync(plansDir)) return;

    const files = fs.readdirSync(plansDir).filter(f => f.startsWith('PLAN_') && f.endsWith('.md'));
    for (const file of files) {
      const filepath = path.join(plansDir, file);
      try {
        const plan = parsePlanFile(filepath);
        if (!isComplete(plan)) {
          this.logger.info('resume', `Resuming incomplete plan: ${file}`, plan.frontmatter.taskRef);
          await executeTaskPlan(plan, this.skillRegistry, this.context);

          const updatedPlan = parsePlanFile(filepath);
          if (isComplete(updatedPlan)) {
            const taskPath = path.join(this.config.folders.needsAction, updatedPlan.frontmatter.taskRef);
            if (fs.existsSync(taskPath)) {
              await completeTask(taskPath, filepath, this.config.folders.done, this.logger);
            }
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('resume_error', `Error resuming ${file}: ${msg}`, msg, file);
      }
    }
  }

  private async updateDashboard(): Promise<void> {
    const dashboardSkill = new DashboardSkill();
    const dummyTask = { filename: '_dashboard_', filepath: '', frontmatter: {} as any, body: '', raw: '' };
    await dashboardSkill.execute(dummyTask, this.context);
  }

  async start(): Promise<void> {
    this.logger.info('daemon_start', `AI Employee daemon starting (dryRun: ${this.config.dryRun})`);
    this.logger.info('daemon_start', `Vault path: ${this.config.vaultPath}`);
    this.logger.info('daemon_start', `Poll interval: ${this.config.pollIntervalMs}ms`);
    this.logger.info('daemon_start', `Registered skills: ${this.skillRegistry.getRegisteredSkills().map(s => s.name).join(', ')}`);

    this.context = this.buildContext();

    // Start watchers
    this.inboxWatcher.start();

    // T033: Start approval watcher
    this.approvalWatcher = new ApprovalWatcher(
      this.config.folders.approved,
      this.config.folders.rejected,
      this.logger,
    );
    this.approvalWatcher.start();

    // Initial scan
    await this.scanAndProcess();

    // Periodic scan
    const interval = setInterval(() => {
      this.scanAndProcess().catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('scan_error', `Periodic scan failed: ${msg}`, msg);
      });
    }, this.config.pollIntervalMs);

    // T018: Graceful shutdown
    const shutdown = async () => {
      this.logger.info('daemon_stop', 'Shutting down gracefully...');
      clearInterval(interval);
      await this.inboxWatcher.stop();
      if (this.approvalWatcher) await this.approvalWatcher.stop();
      this.logger.info('daemon_stop', 'AI Employee daemon stopped');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    this.logger.info('daemon_start', 'AI Employee daemon is running. Press Ctrl+C to stop.');
  }
}

// Entry point
const daemon = new AIDaemon();
daemon.start().catch(err => {
  console.error('Failed to start daemon:', err);
  process.exit(1);
});
