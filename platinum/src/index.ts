import { loadPlatinumConfig, PlatinumConfig, AgentMode } from './config/platinum-config';
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
import { getGmailMCPConfig, getLinkedInMCPConfig } from '../../silver/src/mcp/mcp-configs';
import { GmailWatcher } from '../../silver/src/watchers/gmail-watcher';
import { LinkedInWatcher } from '../../silver/src/watchers/linkedin-watcher';
import { SendEmailSkill } from '../../silver/src/skills/send-email.skill';
import { LinkedInPostSkill } from '../../silver/src/skills/linkedin-post.skill';
import { DailyBriefingSkill } from '../../silver/src/skills/daily-briefing.skill';

import { GoldExecutionContext, executeGoldTaskPlan } from '../../gold/src/pipeline/gold-executor';
import { AuditLogger } from '../../gold/src/logging/audit-logger';
import { OdooInvoiceSkill } from '../../gold/src/skills/odoo-invoice.skill';
import { OdooReportSkill } from '../../gold/src/skills/odoo-report.skill';
import { SocialPostSkill } from '../../gold/src/skills/social-post.skill';
import { CEOBriefingSkill } from '../../gold/src/skills/ceo-briefing.skill';
import { SocialMediaManager } from '../../gold/src/social/social-media-manager';
import { FacebookClient } from '../../gold/src/social/facebook-client';
import { InstagramClient } from '../../gold/src/social/instagram-client';
import { TwitterClient } from '../../gold/src/social/twitter-client';

import { VaultSync } from './sync/vault-sync';
import { loadZoneOwnership } from './sync/sync-owners';
import { ensureVaultGitignore } from './sync/vault-gitignore';
import { ZoneGuard } from './zone/zone-guard';
import { isSkillAllowedForMode } from './zone/skill-filter';
import { auditCloudCredentials } from './zone/credential-audit';
import { HealthMonitor } from './health/health-monitor';
import { BackupManager } from './health/backup-manager';
import { RateLimiter } from './rate-limit/rate-limiter';
import { PlatinumExecutionContext } from './pipeline/platinum-executor';

import fs from 'fs';
import path from 'path';

class PlatinumDaemon {
  private config: PlatinumConfig;
  private agentMode: AgentMode;
  private logger: Logger;
  private claudeClient: ClaudeClient;
  private skillRegistry: SkillRegistry;
  private mcpManager: MCPManager;
  private auditLogger: AuditLogger;
  private socialMediaManager: SocialMediaManager;

  // Platinum components
  private vaultSync: VaultSync | null = null;
  private zoneGuard: ZoneGuard;
  private healthMonitor: HealthMonitor;
  private backupManager: BackupManager;
  private rateLimiter: RateLimiter;

  // Watchers
  private inboxWatcher: InboxWatcher;
  private gmailWatcher: GmailWatcher | null = null;
  private linkedInWatcher: LinkedInWatcher | null = null;
  private approvalWatcher: ApprovalWatcher | null = null;

  private context!: PlatinumExecutionContext;
  private taskQueue: string[] = [];
  private processing = false;
  private serviceHealth: Record<string, boolean> = {};

  constructor() {
    this.config = loadPlatinumConfig();
    this.agentMode = this.config.agentMode;
    this.logger = new Logger(this.config.folders.logs, this.config.logLevel);
    this.claudeClient = new ClaudeClient(this.config.dryRun);
    this.skillRegistry = new SkillRegistry();
    this.mcpManager = new MCPManager(this.logger, this.config.folders.logs, this.config.dryRun);
    this.auditLogger = new AuditLogger(this.config.audit.logsDir, this.config.audit.enableHashChaining);

    // Social media clients
    const facebookClient = new FacebookClient(this.config.socialMedia.facebook, this.config.dryRun);
    const instagramClient = new InstagramClient(this.config.socialMedia.instagram, this.config.dryRun);
    const twitterClient = new TwitterClient(this.config.socialMedia.twitter, this.config.dryRun);
    this.socialMediaManager = new SocialMediaManager(facebookClient, instagramClient, twitterClient, this.logger);

    // Zone ownership
    const ownership = loadZoneOwnership(this.config.vaultPath);
    this.config.zoneOwnership = ownership;

    // Zone guard
    this.zoneGuard = new ZoneGuard(this.agentMode, ownership, this.config.vaultPath, this.logger);

    // Health monitor
    this.healthMonitor = new HealthMonitor(
      this.config.healthCheck,
      this.agentMode,
      this.config.vaultPath,
      this.logger,
      this.auditLogger,
    );

    // Backup manager
    this.backupManager = new BackupManager(this.config.healthCheck, this.config.vaultPath, this.logger);

    // Rate limiter
    this.rateLimiter = new RateLimiter(this.config.rateLimit);

    // ─── Register skills based on agent mode ─────────────────────
    // Bronze skills (safe for both modes)
    this.skillRegistry.register(new SummarizeSkill(), 10);
    this.skillRegistry.register(new DraftEmailSkill(), 20);
    this.skillRegistry.register(new DashboardSkill(), 100);
    this.skillRegistry.register(new GenericReasoningSkill(), 999);

    // Read-only / draft-only Gold skills (safe for both modes)
    this.skillRegistry.register(new OdooReportSkill(this.mcpManager), 13);
    this.skillRegistry.register(new CEOBriefingSkill(this.mcpManager), 8);
    this.skillRegistry.register(new DailyBriefingSkill(), 30);

    // Execute skills — LOCAL ONLY
    if (isSkillAllowedForMode('SendEmailSkill', this.agentMode)) {
      this.skillRegistry.register(new SendEmailSkill(this.mcpManager), 15);
    }
    if (isSkillAllowedForMode('LinkedInPostSkill', this.agentMode)) {
      this.skillRegistry.register(new LinkedInPostSkill(this.mcpManager), 25);
    }
    if (isSkillAllowedForMode('OdooInvoiceSkill', this.agentMode)) {
      this.skillRegistry.register(new OdooInvoiceSkill(this.mcpManager), 12);
    }
    if (isSkillAllowedForMode('SocialPostSkill', this.agentMode)) {
      this.skillRegistry.register(new SocialPostSkill(this.socialMediaManager), 22);
    }

    // Inbox watcher
    this.inboxWatcher = new InboxWatcher(
      this.config.folders.inbox,
      this.logger,
      (filepath) => this.enqueueTask(filepath),
    );
  }

  private writePidFile(): void {
    const pidPath = this.config.watchdog.pidFilePath;
    fs.writeFileSync(pidPath, String(process.pid), 'utf-8');
    this.logger.info('platinum_pid', `PID file written: ${pidPath} (PID: ${process.pid})`);
  }

  private removePidFile(): void {
    const pidPath = this.config.watchdog.pidFilePath;
    try {
      if (fs.existsSync(pidPath)) {
        fs.unlinkSync(pidPath);
      }
    } catch { /* ignore */ }
  }

  private buildContext(): PlatinumExecutionContext {
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
      agentMode: this.agentMode,
      zoneGuard: this.zoneGuard,
      rateLimiter: this.rateLimiter,
      healthMonitor: this.healthMonitor,
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
    this.logger.info('task_process', `[${this.agentMode}] Processing task: ${filename}`, filename);

    this.auditLogger.log({
      actor: `platinum-daemon-${this.agentMode}`,
      action: 'task_processing_start',
      parameters: { filename, agentMode: this.agentMode },
      approvalStatus: 'not_required',
      result: { success: true, detail: `Started processing ${filename}`, duration_ms: 0 },
      financial: null,
    });

    try {
      const plan = await planTask(
        taskPath,
        this.config.folders.plans,
        this.claudeClient,
        this.logger,
        this.context.handbook ?? undefined,
      );

      if (!plan) {
        this.logger.error('task_process', `Failed to create plan for ${filename}`, 'Planning failed', filename);
        return;
      }

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
          this.logger.info('resume', `[${this.agentMode}] Resuming incomplete plan: ${file}`, plan.frontmatter.taskRef);
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
    // Single-writer guard: only local agent writes Dashboard.md
    if (this.agentMode !== 'local') {
      return;
    }

    const dashboardSkill = new DashboardSkill();
    const dummyTask = { filename: '_dashboard_', filepath: '', frontmatter: {} as any, body: '', raw: '' };
    await dashboardSkill.execute(dummyTask, this.context);
  }

  async start(): Promise<void> {
    this.logger.info('platinum_start', `Platinum AI Employee daemon starting (mode: ${this.agentMode}, dryRun: ${this.config.dryRun})`);
    this.logger.info('platinum_start', `Vault path: ${this.config.vaultPath}`);
    this.logger.info('platinum_start', `Registered skills: ${this.skillRegistry.getRegisteredSkills().map(s => s.name).join(', ')}`);

    // Write PID file
    this.writePidFile();

    // Credential audit (cloud mode)
    if (this.agentMode === 'cloud') {
      const auditResult = auditCloudCredentials(this.config);
      if (!auditResult.clean) {
        this.logger.warn('credential_audit', `CRITICAL: Sensitive credentials detected on cloud server!`);
        for (const v of auditResult.violations) {
          this.logger.warn('credential_audit', `  - ${v}`);
        }

        this.auditLogger.log({
          actor: 'platinum-daemon-cloud',
          action: 'credential_audit_violation',
          parameters: { violations: auditResult.violations },
          approvalStatus: 'not_required',
          result: { success: false, detail: `${auditResult.violations.length} sensitive credentials found on cloud`, duration_ms: 0 },
          financial: null,
        });
      } else {
        this.logger.info('credential_audit', `Cloud credential audit passed (${auditResult.checkedVars} vars checked, 0 violations)`);
      }
    }

    // Build execution context
    this.context = this.buildContext();

    // Log startup audit entry
    this.auditLogger.log({
      actor: `platinum-daemon-${this.agentMode}`,
      action: 'daemon_start',
      parameters: {
        agentMode: this.agentMode,
        dryRun: this.config.dryRun,
        pid: process.pid,
        skills: this.skillRegistry.getRegisteredSkills().map(s => s.name),
        syncEnabled: this.config.sync.enabled,
        syncRemote: this.config.sync.remoteUrl || 'not configured',
      },
      approvalStatus: 'not_required',
      result: { success: true, detail: `Platinum daemon started in ${this.agentMode} mode`, duration_ms: 0 },
      financial: null,
    });

    // Connect MCP servers (graceful degradation)
    await this.connectMCPServers();

    // Initialize vault sync
    if (this.config.sync.enabled && this.config.sync.remoteUrl) {
      ensureVaultGitignore(this.config.vaultPath);

      this.vaultSync = new VaultSync(
        this.config.vaultPath,
        this.config.sync,
        this.config.zoneOwnership,
        this.agentMode,
        this.logger,
      );

      this.vaultSync.startAutoSync();

      // Register sync health checker
      this.healthMonitor.registerSyncHealthChecker(
        () => this.vaultSync!.isSyncHealthy(),
        () => this.vaultSync!.getLastSyncTimestamp(),
      );
    }

    // Start health monitor (primarily for cloud mode)
    if (this.config.healthCheck.checkIntervalMs > 0) {
      // Register MCP service health checkers
      for (const [name, healthy] of Object.entries(this.serviceHealth)) {
        this.healthMonitor.registerService(name, async () => {
          return this.serviceHealth[name] ?? false;
        });
      }

      this.healthMonitor.start();
    }

    // Start backup manager (cloud mode only)
    if (this.agentMode === 'cloud' && this.config.healthCheck.backupEnabled) {
      this.backupManager.startScheduledBackups();
    }

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
        this.logger.warn('platinum_start', 'Gmail watcher failed to start');
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
        this.logger.warn('platinum_start', 'LinkedIn watcher failed to start');
        this.serviceHealth['linkedin'] = false;
      }
    }

    // Start approval watcher
    this.approvalWatcher = new ApprovalWatcher(
      this.config.folders.approved,
      this.config.folders.rejected,
      this.logger,
    );
    this.approvalWatcher.onDecision((_filename, decision) => {
      this.logger.info('approval_decision', `Approval decision: ${decision} — triggering re-scan`);
      this.scanAndProcess().catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error('approval_scan_error', `Re-scan after approval failed: ${msg}`, msg);
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
      this.logger.info('platinum_stop', `Shutting down Platinum daemon (${this.agentMode})...`);

      this.auditLogger.log({
        actor: `platinum-daemon-${this.agentMode}`,
        action: 'daemon_shutdown',
        parameters: { agentMode: this.agentMode },
        approvalStatus: 'not_required',
        result: { success: true, detail: `Platinum daemon shutting down (${this.agentMode})`, duration_ms: 0 },
        financial: null,
      });

      clearInterval(interval);
      if (this.vaultSync) this.vaultSync.stopAutoSync();
      this.healthMonitor.stop();
      this.backupManager.stopScheduledBackups();
      await this.inboxWatcher.stop();
      if (this.gmailWatcher) await this.gmailWatcher.stop();
      if (this.linkedInWatcher) await this.linkedInWatcher.stop();
      if (this.approvalWatcher) await this.approvalWatcher.stop();
      await this.mcpManager.disconnectAll();
      this.removePidFile();
      this.logger.info('platinum_stop', 'Platinum AI Employee daemon stopped');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('exit', () => this.removePidFile());

    this.logger.info('platinum_start', `Platinum AI Employee daemon is running (${this.agentMode} mode). Press Ctrl+C to stop.`);
  }

  private async connectMCPServers(): Promise<void> {
    // Gmail MCP
    try {
      await this.mcpManager.connect(getGmailMCPConfig());
      this.serviceHealth['gmail_mcp'] = true;
    } catch {
      this.logger.warn('platinum_start', 'Gmail MCP server connection failed');
      this.serviceHealth['gmail_mcp'] = false;
    }

    // LinkedIn MCP
    try {
      await this.mcpManager.connect(getLinkedInMCPConfig());
      this.serviceHealth['linkedin_mcp'] = true;
    } catch {
      this.logger.warn('platinum_start', 'LinkedIn MCP server connection failed');
      this.serviceHealth['linkedin_mcp'] = false;
    }

    // Odoo MCP
    try {
      await this.mcpManager.connect(this.config.mcp.odoo);
      this.serviceHealth['odoo'] = true;
      this.logger.info('platinum_start', 'Odoo MCP server connected');
    } catch {
      this.logger.warn('platinum_start', 'Odoo MCP server connection failed');
      this.serviceHealth['odoo'] = false;
    }
  }

  getMode(): AgentMode {
    return this.agentMode;
  }

  getHealth() {
    return this.healthMonitor.getStatus();
  }
}

// Entry point
const daemon = new PlatinumDaemon();
daemon.start().catch(err => {
  console.error('Failed to start Platinum daemon:', err);
  process.exit(1);
});
