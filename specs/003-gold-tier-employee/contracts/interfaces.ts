/**
 * Gold Tier Contracts & Interfaces
 * Feature: 003-gold-tier-employee
 *
 * These interfaces define the contracts between Gold tier components.
 * Gold extends Silver's execution context and adds new capabilities.
 */

import { SilverConfig } from '../../../silver/src/config/silver-config';
import { MCPManager } from '../../../silver/src/mcp/mcp-manager';
import { ExecutionContext } from '../../../bronze/src/skills/base-skill';
import { Logger } from '../../../bronze/src/logging/logger';

// ─── Configuration ───────────────────────────────────────────────

export interface OdooConfig {
  url: string;            // e.g., "http://localhost:8069"
  database: string;       // Odoo database name
  username: string;       // Odoo username
  apiKey: string;         // Odoo API key
}

export interface SocialMediaCredentials {
  facebook: {
    pageId: string;
    pageAccessToken: string;
  };
  instagram: {
    businessAccountId: string;
    accessToken: string;
  };
  twitter: {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessTokenSecret: string;
  };
}

export interface WatchdogConfig {
  pidFilePath: string;
  checkIntervalMs: number;    // default: 30000
  maxRestarts: number;        // default: 10
  daemonCommand: string;      // command to start daemon
  daemonArgs: string[];       // args for daemon command
}

export interface GoldConfig extends SilverConfig {
  odoo: OdooConfig;
  socialMedia: SocialMediaCredentials;
  watchdog: WatchdogConfig;
  audit: {
    logsDir: string;          // default: vault /Logs
    enableHashChaining: boolean;
  };
  persistence: {
    stallTimeoutMs: number;   // default: 300000 (5 min)
    maxRetries: number;       // default: 3
    retryBackoffMs: number;   // default: 5000
  };
}

// ─── Execution Context ───────────────────────────────────────────

export interface GoldExecutionContext extends ExecutionContext {
  mcpManager: MCPManager;
  socialMediaManager: ISocialMediaManager;
  auditLogger: IAuditLogger;
}

// ─── Odoo MCP Server Tools ──────────────────────────────────────

/** Tools exposed by the custom Odoo MCP server */
export interface OdooMCPTools {
  create_invoice: {
    params: {
      customer: string;
      lineItems: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        taxRate?: number;
      }>;
      currency?: string;
      dateDue?: string;
    };
    result: {
      odooId: number;
      invoiceNumber: string;
      status: 'draft';
      total: number;
    };
  };
  post_invoice: {
    params: { odooId: number };
    result: { odooId: number; status: 'posted'; invoiceNumber: string };
  };
  list_invoices: {
    params: { status?: string; customer?: string; limit?: number };
    result: Array<{
      odooId: number;
      invoiceNumber: string;
      customer: string;
      total: number;
      status: string;
      dateDue: string;
    }>;
  };
  get_invoice: {
    params: { odooId: number };
    result: {
      odooId: number;
      invoiceNumber: string;
      customer: string;
      lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
      subtotal: number;
      taxAmount: number;
      total: number;
      currency: string;
      status: string;
      dateInvoice: string;
      dateDue: string;
    };
  };
  create_journal_entry: {
    params: {
      journal: string;
      date: string;
      reference: string;
      lines: Array<{ account: string; debit: number; credit: number; label: string }>;
    };
    result: { odooId: number; reference: string; status: 'draft' };
  };
  list_journal_entries: {
    params: { journal?: string; dateFrom?: string; dateTo?: string; limit?: number };
    result: Array<{
      odooId: number;
      journal: string;
      reference: string;
      date: string;
      status: string;
    }>;
  };
}

// ─── Social Media Manager ────────────────────────────────────────

export type SocialPlatform = 'facebook' | 'instagram' | 'twitter' | 'linkedin';

export interface PlatformPostResult {
  success: boolean;
  platform: SocialPlatform;
  postId: string | null;
  postUrl: string | null;
  error: string | null;
}

export interface PlatformEngagement {
  platform: SocialPlatform;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
  fetchedAt: string;
}

export interface ISocialMediaManager {
  /** Publish text content to a specific platform */
  publish(platform: SocialPlatform, text: string, mediaUrls?: string[]): Promise<PlatformPostResult>;

  /** Get engagement metrics for a published post */
  getEngagement(platform: SocialPlatform, postId: string): Promise<PlatformEngagement>;

  /** Check if credentials are configured for a platform */
  isConfigured(platform: SocialPlatform): boolean;

  /** Get all configured platforms */
  getConfiguredPlatforms(): SocialPlatform[];
}

// ─── Audit Logger ────────────────────────────────────────────────

export type ApprovalStatus = 'approved' | 'rejected' | 'not_required';

export interface AuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  parameters: Record<string, unknown>;
  approvalStatus: ApprovalStatus;
  result: {
    success: boolean;
    detail: string;
    duration_ms: number;
  };
  financial: {
    odooRecordId: number;
    amount: number;
    currency: string;
    approvalChainRef: string;
  } | null;
  previousHash: string;
  entryHash: string;
}

export interface IAuditLogger {
  /** Log an action with full audit trail */
  log(entry: Omit<AuditEntry, 'timestamp' | 'previousHash' | 'entryHash'>): void;

  /** Log a financial action with additional metadata */
  logFinancial(
    actor: string,
    action: string,
    params: Record<string, unknown>,
    approvalStatus: ApprovalStatus,
    result: AuditEntry['result'],
    financial: NonNullable<AuditEntry['financial']>
  ): void;

  /** Get today's audit entries */
  getTodayEntries(): AuditEntry[];

  /** Verify hash chain integrity for a given date */
  verifyIntegrity(date: string): { valid: boolean; brokenAt: number | null };
}

// ─── Persistence Loop ────────────────────────────────────────────

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

export interface IPersistenceLoop {
  /** Start the persistence loop for a task */
  start(taskRef: string, planRef: string): Promise<void>;

  /** Check if the task is complete */
  isComplete(): boolean;

  /** Get current loop state */
  getState(): PersistenceLoopState;

  /** Signal external completion (e.g., file moved to /Done) */
  signalCompletion(condition: CompletionCondition['type']): void;
}

// ─── Watchdog ────────────────────────────────────────────────────

export interface IWatchdog {
  /** Start monitoring the daemon process */
  start(): void;

  /** Stop monitoring */
  stop(): void;

  /** Check if daemon is running */
  isDaemonRunning(): boolean;

  /** Get watchdog status */
  getStatus(): {
    daemonStatus: 'running' | 'stopped' | 'restarting' | 'failed';
    restartCount: number;
    lastCheck: string;
    lastRestart: string | null;
  };
}

// ─── Gold Task Types ─────────────────────────────────────────────

export type GoldTaskType =
  | 'file_drop'          // Bronze
  | 'email'              // Silver
  | 'linkedin_message'   // Silver
  | 'linkedin_post'      // Silver
  | 'scheduled'          // Silver
  | 'odoo_invoice'       // Gold
  | 'odoo_journal'       // Gold
  | 'social_post'        // Gold
  | 'ceo_briefing'       // Gold
  | 'financial_report';  // Gold
