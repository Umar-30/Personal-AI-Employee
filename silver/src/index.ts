import { loadSilverConfig, SilverConfig } from './config/silver-config';
import { Logger } from '../../bronze/src/logging/logger';
import { InboxWatcher } from '../../bronze/src/watcher/inbox-watcher';
import { processIntake } from '../../bronze/src/pipeline/intake';
import { ClaudeClient } from '../../bronze/src/claude/claude-client';
import { SkillRegistry } from '../../bronze/src/skills/skill-registry';
import { ExecutionContext } from '../../bronze/src/skills/base-skill';
import { planTask } from '../../bronze/src/pipeline/planner';
import { completeTask } from '../../bronze/src/pipeline/completer';
import { ApprovalWatcher } from '../../bronze/src/approval/approval-watcher';
import { SummarizeSkill } from '../../bronze/src/skills/summarize.skill';
import { DraftEmailSkill } from '../../bronze/src/skills/draft-email.skill';
import { GenericReasoningSkill } from '../../bronze/src/skills/generic-reasoning.skill';
import { DashboardSkill } from '../../bronze/src/skills/dashboard.skill';
import { parsePlanFile, isComplete } from '../../bronze/src/models/plan-file';
import { parseTaskFile } from '../../bronze/src/models/task-file';

import { MCPManager } from './mcp/mcp-manager';
import { getGmailMCPConfig, getLinkedInMCPConfig } from './mcp/mcp-configs';
import { GmailWatcher } from './watchers/gmail-watcher';
import { LinkedInWatcher } from './watchers/linkedin-watcher';
import { WhatsAppWatcher } from './watchers/whatsapp-watcher';
import { SilverExecutionContext, executeSilverTaskPlan } from './pipeline/silver-executor';
import { SendEmailSkill } from './skills/send-email.skill';
import { LinkedInPostSkill } from './skills/linkedin-post.skill';
import { DailyBriefingSkill } from './skills/daily-briefing.skill';

import fs from 'fs';
import path from 'path';

class SilverDaemon {
  private config: SilverConfig;
  private logger: Logger;
  private claudeClient: ClaudeClient;
  private skillRegistry: SkillRegistry;
  private mcpManager: MCPManager;

  // Watchers
  private inboxWatcher: InboxWatcher;
  private gmailWatcher: GmailWatcher | null = null;
  private linkedInWatcher: LinkedInWatcher | null = null;
  private whatsappWatcher: WhatsAppWatcher | null = null;
  private approvalWatcher: ApprovalWatcher | null = null;

  private context!: SilverExecutionContext;
  private taskQueue: string[] = [];
  private processing = false;

  constructor() {
    this.config = loadSilverConfig();
    this.logger = new Logger(this.config.folders.logs, this.config.logLevel);
    this.claudeClient = new ClaudeClient(this.config.dryRun);
    this.skillRegistry = new SkillRegistry();
    this.mcpManager = new MCPManager(this.logger, this.config.folders.logs, this.config.dryRun);

    // Register Bronze skills
    this.skillRegistry.register(new SummarizeSkill(), 10);
    this.skillRegistry.register(new DraftEmailSkill(), 20);
    this.skillRegistry.register(new DashboardSkill(), 100);

    // Register Silver skills
    this.skillRegistry.register(new SendEmailSkill(this.mcpManager), 15);
    this.skillRegistry.register(new LinkedInPostSkill(this.mcpManager), 25);
    this.skillRegistry.register(new DailyBriefingSkill(), 30);

    // Generic reasoning as fallback (lowest priority)
    this.skillRegistry.register(new GenericReasoningSkill(), 999);

    // Bronze file-drop watcher
    this.inboxWatcher = new InboxWatcher(
      this.config.folders.inbox,
      this.logger,
      (filepath) => this.enqueueTask(filepath),
    );
  }

  private buildContext(): SilverExecutionContext {
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
      mcpManager: this.mcpManager,
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

    await this.resumeIncompletePlans();
  }

  private async processTask(taskPath: string): Promise<void> {
    const filename = path.basename(taskPath);
    this.logger.info('task_process', `Processing task: ${filename}`, filename);

    try {
      const plan = await planTask(taskPath, this.config.folders.plans, this.claudeClient, this.logger, this.context.handbook ?? undefined);

      if (!plan) {
        this.logger.error('task_process', `Failed to create plan for ${filename}`, 'Planning failed', filename);
        return;
      }

      // Use Silver executor (MCP-aware)
      await executeSilverTaskPlan(plan, this.skillRegistry, this.context);

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
          await executeSilverTaskPlan(plan, this.skillRegistry, this.context);

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
    this.logger.info('silver_start', `Silver AI Employee daemon starting (dryRun: ${this.config.dryRun})`);
    this.logger.info('silver_start', `Vault path: ${this.config.vaultPath}`);
    this.logger.info('silver_start', `Registered skills: ${this.skillRegistry.getRegisteredSkills().map(s => s.name).join(', ')}`);

    this.context = this.buildContext();

    // Connect MCP servers (non-blocking — continue even if one fails)
    await this.connectMCPServers();

    // Start Bronze file-drop watcher
    this.inboxWatcher.start();

    // Start Silver watchers
    if (this.config.watchers.gmail.enabled) {
      this.gmailWatcher = new GmailWatcher(
        this.config.folders.needsAction,
        this.config.folders.logs,
        this.config.watchers.gmail.pollIntervalMs,
        this.logger,
        this.mcpManager,
      );
      await this.gmailWatcher.start();
    } else {
      this.logger.warn('silver_start', 'Gmail watcher disabled (no credentials configured)');
    }

    if (this.config.watchers.linkedin.enabled) {
      this.linkedInWatcher = new LinkedInWatcher(
        this.config.folders.needsAction,
        this.config.folders.logs,
        this.config.watchers.linkedin.pollIntervalMs,
        this.logger,
        this.mcpManager,
      );
      await this.linkedInWatcher.start();
    } else {
      this.logger.warn('silver_start', 'LinkedIn watcher disabled (no access token configured)');
    }

    if (this.config.watchers.whatsapp.enabled) {
      this.whatsappWatcher = new WhatsAppWatcher(
        this.config.folders.needsAction,
        this.config.folders.logs,
        this.config.watchers.whatsapp.pollIntervalMs,
        this.logger,
        this.config.watchers.whatsapp.instanceId,
        this.config.watchers.whatsapp.apiToken,
      );
      await this.whatsappWatcher.start();
    } else {
      this.logger.warn('silver_start', 'WhatsApp watcher disabled (no GREEN_API_INSTANCE_ID / GREEN_API_TOKEN configured)');
    }

    // Start approval watcher
    this.approvalWatcher = new ApprovalWatcher(
      this.config.folders.approved,
      this.config.folders.rejected,
      this.logger,
    );
    this.approvalWatcher.onDecision((_filename, decision) => {
      this.logger.info('approval_decision', `Approval decision received: ${decision} — triggering re-scan`);
      this.scanAndProcess().catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('approval_rescan_error', `Re-scan after approval failed: ${msg}`, msg);
      });
    });
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

    // Graceful shutdown
    const shutdown = async () => {
      this.logger.info('silver_stop', 'Shutting down Silver daemon...');
      clearInterval(interval);
      await this.inboxWatcher.stop();
      if (this.gmailWatcher) await this.gmailWatcher.stop();
      if (this.linkedInWatcher) await this.linkedInWatcher.stop();
      if (this.whatsappWatcher) await this.whatsappWatcher.stop();
      if (this.approvalWatcher) await this.approvalWatcher.stop();
      await this.mcpManager.disconnectAll();
      this.logger.info('silver_stop', 'Silver AI Employee daemon stopped');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    this.logger.info('silver_start', 'Silver AI Employee daemon is running. Press Ctrl+C to stop.');
  }

  private async connectMCPServers(): Promise<void> {
    try {
      await this.mcpManager.connect(getGmailMCPConfig());
    } catch {
      this.logger.warn('silver_start', 'Gmail MCP server connection failed — email features will be unavailable');
    }

    try {
      await this.mcpManager.connect(getLinkedInMCPConfig());
    } catch {
      this.logger.warn('silver_start', 'LinkedIn MCP server connection failed — LinkedIn features will be unavailable');
    }
  }
}

// Entry point
const daemon = new SilverDaemon();
daemon.start().catch(err => {
  console.error('Failed to start Silver daemon:', err);
  process.exit(1);
});
