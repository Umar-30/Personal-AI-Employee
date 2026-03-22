import { loadGoldConfig, GoldConfig } from './config/gold-config';
import { Logger } from '../../bronze/src/logging/logger';
import { InboxWatcher } from '../../bronze/src/watcher/inbox-watcher';
import { processIntake } from '../../bronze/src/pipeline/intake';
import { ClaudeClient } from '../../bronze/src/claude/claude-client';
import { SkillRegistry } from '../../bronze/src/skills/skill-registry';
import { planTask } from '../../bronze/src/pipeline/planner';
import { completeTask } from '../../bronze/src/pipeline/completer';
import { ApprovalWatcher } from '../../bronze/src/approval/approval-watcher';
import { SummarizeSkill } from '../../bronze/src/skills/summarize.skill';
import { DraftEmailSkill } from '../../bronze/src/skills/draft-email.skill';
import { GenericReasoningSkill } from '../../bronze/src/skills/generic-reasoning.skill';
import { DashboardSkill } from '../../bronze/src/skills/dashboard.skill';
import { parsePlanFile, isComplete } from '../../bronze/src/models/plan-file';
import { parseTaskFile } from '../../bronze/src/models/task-file';

import { MCPManager } from '../../silver/src/mcp/mcp-manager';
import { getGmailMCPConfig, getLinkedInMCPConfig, ensureGmailTokenFresh } from '../../silver/src/mcp/mcp-configs';
import { GmailWatcher } from '../../silver/src/watchers/gmail-watcher';
import { LinkedInWatcher } from '../../silver/src/watchers/linkedin-watcher';
import { SendEmailSkill } from '../../silver/src/skills/send-email.skill';
import { LinkedInPostSkill } from '../../silver/src/skills/linkedin-post.skill';
import { DailyBriefingSkill } from '../../silver/src/skills/daily-briefing.skill';

import { GoldExecutionContext, executeGoldTaskPlan } from './pipeline/gold-executor';
import { AuditLogger } from './logging/audit-logger';
import { OdooInvoiceSkill } from './skills/odoo-invoice.skill';
import { OdooReportSkill } from './skills/odoo-report.skill';
import { SocialPostSkill } from './skills/social-post.skill';
import { CEOBriefingSkill } from './skills/ceo-briefing.skill';
import { SocialMediaManager } from './social/social-media-manager';
import { FacebookClient } from './social/facebook-client';
import { InstagramClient } from './social/instagram-client';
import { TwitterClient } from './social/twitter-client';
import { PersistenceLoop } from './persistence/persistence-loop';

import fs from 'fs';
import path from 'path';

class GoldDaemon {
  private config: GoldConfig;
  private logger: Logger;
  private claudeClient: ClaudeClient;
  private skillRegistry: SkillRegistry;
  private mcpManager: MCPManager;
  private auditLogger: AuditLogger;
  private socialMediaManager: SocialMediaManager;

  // Watchers
  private inboxWatcher: InboxWatcher;
  private gmailWatcher: GmailWatcher | null = null;
  private linkedInWatcher: LinkedInWatcher | null = null;
  private approvalWatcher: ApprovalWatcher | null = null;

  private context!: GoldExecutionContext;
  private taskQueue: string[] = [];
  private processing = false;

  // Service health tracking
  private serviceHealth: Record<string, boolean> = {};

  constructor() {
    this.config = loadGoldConfig();
    this.logger = new Logger(this.config.folders.logs, this.config.logLevel);
    this.claudeClient = new ClaudeClient(this.config.dryRun);
    this.skillRegistry = new SkillRegistry();
    this.mcpManager = new MCPManager(this.logger, this.config.folders.logs, this.config.dryRun);
    this.auditLogger = new AuditLogger(this.config.audit.logsDir, this.config.audit.enableHashChaining);

    // Initialize social media clients
    const facebookClient = new FacebookClient(this.config.socialMedia.facebook, this.config.dryRun);
    const instagramClient = new InstagramClient(this.config.socialMedia.instagram, this.config.dryRun);
    const twitterClient = new TwitterClient(this.config.socialMedia.twitter, this.config.dryRun);
    this.socialMediaManager = new SocialMediaManager(facebookClient, instagramClient, twitterClient, this.logger);

    // Register Bronze skills
    this.skillRegistry.register(new SummarizeSkill(), 10);
    this.skillRegistry.register(new DraftEmailSkill(), 20);
    this.skillRegistry.register(new DashboardSkill(), 100);

    // Register Silver skills
    this.skillRegistry.register(new SendEmailSkill(this.mcpManager), 15);
    this.skillRegistry.register(new LinkedInPostSkill(this.mcpManager), 25);
    this.skillRegistry.register(new DailyBriefingSkill(), 30);

    // Register Gold skills
    this.skillRegistry.register(new OdooInvoiceSkill(this.mcpManager), 12);
    this.skillRegistry.register(new OdooReportSkill(this.mcpManager), 13);
    this.skillRegistry.register(new SocialPostSkill(this.socialMediaManager), 22);
    this.skillRegistry.register(new CEOBriefingSkill(this.mcpManager), 8);

    // Generic reasoning as fallback
    this.skillRegistry.register(new GenericReasoningSkill(), 999);

    // Bronze file-drop watcher
    this.inboxWatcher = new InboxWatcher(
      this.config.folders.inbox,
      this.logger,
      (filepath) => this.enqueueTask(filepath),
    );
  }

  private writePidFile(): void {
    const pidPath = this.config.watchdog.pidFilePath;
    fs.writeFileSync(pidPath, String(process.pid), 'utf-8');
    this.logger.info('gold_pid', `PID file written: ${pidPath} (PID: ${process.pid})`);
  }

  private removePidFile(): void {
    const pidPath = this.config.watchdog.pidFilePath;
    try {
      if (fs.existsSync(pidPath)) {
        fs.unlinkSync(pidPath);
        this.logger.info('gold_pid', 'PID file removed');
      }
    } catch { /* ignore */ }
  }

  private buildContext(): GoldExecutionContext {
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
      auditLogger: this.auditLogger,
      socialMediaManager: this.socialMediaManager,
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

    this.auditLogger.log({
      actor: 'gold-daemon',
      action: 'task_processing_start',
      parameters: { filename },
      approvalStatus: 'not_required',
      result: { success: true, detail: `Started processing ${filename}`, duration_ms: 0 },
      financial: null,
    });

    try {
      const plan = await planTask(taskPath, this.config.folders.plans, this.claudeClient, this.logger, this.context.handbook ?? undefined);

      if (!plan) {
        this.logger.error('task_process', `Failed to create plan for ${filename}`, 'Planning failed', filename);
        return;
      }

      // Use Gold executor (audit-aware)
      await executeGoldTaskPlan(plan, this.skillRegistry, this.context);

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
          await executeGoldTaskPlan(plan, this.skillRegistry, this.context);

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
    this.logger.info('gold_start', `Gold AI Employee daemon starting (dryRun: ${this.config.dryRun})`);
    this.logger.info('gold_start', `Vault path: ${this.config.vaultPath}`);
    this.logger.info('gold_start', `Registered skills: ${this.skillRegistry.getRegisteredSkills().map(s => s.name).join(', ')}`);

    // Write PID file
    this.writePidFile();

    this.context = this.buildContext();

    this.auditLogger.log({
      actor: 'gold-daemon',
      action: 'daemon_start',
      parameters: { dryRun: this.config.dryRun, pid: process.pid },
      approvalStatus: 'not_required',
      result: { success: true, detail: 'Gold daemon started', duration_ms: 0 },
      financial: null,
    });

    // Connect MCP servers (graceful degradation — continue even if some fail)
    await this.connectMCPServers();

    // Log social media status
    const configuredPlatforms = this.socialMediaManager.getConfiguredPlatforms();
    this.logger.info('gold_start', `Social media platforms configured: ${configuredPlatforms.join(', ')}`);

    // Start Bronze file-drop watcher
    this.inboxWatcher.start();

    // Start Silver watchers (graceful degradation)
    if (this.config.watchers.gmail.enabled) {
      try {
        this.gmailWatcher = new GmailWatcher(
          this.config.folders.needsAction,
          this.config.folders.logs,
          this.config.watchers.gmail.pollIntervalMs,
          this.logger,
          this.mcpManager,
        );
        await this.gmailWatcher.start();
        this.serviceHealth['gmail'] = true;
      } catch {
        this.logger.warn('gold_start', 'Gmail watcher failed to start — email features unavailable');
        this.serviceHealth['gmail'] = false;
      }
    }

    if (this.config.watchers.linkedin.enabled) {
      try {
        this.linkedInWatcher = new LinkedInWatcher(
          this.config.folders.needsAction,
          this.config.folders.logs,
          this.config.watchers.linkedin.pollIntervalMs,
          this.logger,
          this.mcpManager,
        );
        await this.linkedInWatcher.start();
        this.serviceHealth['linkedin'] = true;
      } catch {
        this.logger.warn('gold_start', 'LinkedIn watcher failed to start — LinkedIn features unavailable');
        this.serviceHealth['linkedin'] = false;
      }
    }

    // Start approval watcher
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

    // Graceful shutdown
    const shutdown = async () => {
      this.logger.info('gold_stop', 'Shutting down Gold daemon...');

      this.auditLogger.log({
        actor: 'gold-daemon',
        action: 'daemon_shutdown',
        parameters: {},
        approvalStatus: 'not_required',
        result: { success: true, detail: 'Gold daemon shutting down', duration_ms: 0 },
        financial: null,
      });

      clearInterval(interval);
      await this.inboxWatcher.stop();
      if (this.gmailWatcher) await this.gmailWatcher.stop();
      if (this.linkedInWatcher) await this.linkedInWatcher.stop();
      if (this.approvalWatcher) await this.approvalWatcher.stop();
      await this.mcpManager.disconnectAll();
      this.removePidFile();
      this.logger.info('gold_stop', 'Gold AI Employee daemon stopped');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('exit', () => this.removePidFile());

    this.logger.info('gold_start', 'Gold AI Employee daemon is running. Press Ctrl+C to stop.');
  }

  private async connectMCPServers(): Promise<void> {
    // Gmail MCP (Silver)
    try {
      await ensureGmailTokenFresh();
      await this.mcpManager.connect(getGmailMCPConfig());
      this.serviceHealth['gmail_mcp'] = true;
    } catch {
      this.logger.warn('gold_start', 'Gmail MCP server connection failed — email sending unavailable');
      this.serviceHealth['gmail_mcp'] = false;
    }

    // LinkedIn MCP (Silver)
    try {
      await this.mcpManager.connect(getLinkedInMCPConfig());
      this.serviceHealth['linkedin_mcp'] = true;
    } catch {
      this.logger.warn('gold_start', 'LinkedIn MCP server connection failed — LinkedIn features unavailable');
      this.serviceHealth['linkedin_mcp'] = false;
    }

    // Odoo MCP (Gold)
    try {
      await this.mcpManager.connect(this.config.mcp.odoo);
      this.serviceHealth['odoo'] = true;
      this.logger.info('gold_start', 'Odoo MCP server connected successfully');
    } catch {
      this.logger.warn('gold_start', 'Odoo MCP server connection failed — accounting features unavailable');
      this.serviceHealth['odoo'] = false;
    }
  }
}

// Entry point
const daemon = new GoldDaemon();
daemon.start().catch(err => {
  console.error('Failed to start Gold daemon:', err);
  process.exit(1);
});
