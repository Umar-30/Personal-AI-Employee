/**
 * Silver Tier API Contracts
 *
 * These interfaces define the contracts between Silver components.
 * They extend Bronze interfaces where applicable.
 */

// ─── Extended Frontmatter Types ────────────────────────────────────────

/** Silver adds new task types beyond Bronze's file_drop/email/whatsapp */
export type SilverTaskType = 'file_drop' | 'email' | 'linkedin_message' | 'linkedin_post' | 'scheduled';

/** Extended frontmatter with source_id for deduplication */
export interface SilverTaskFrontmatter {
  type: SilverTaskType;
  source: string;       // 'local' | 'gmail' | 'linkedin' | 'scheduler'
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  created: string;
  source_id?: string;   // External ID for dedup (Gmail msg ID, LinkedIn notif ID)
}

// ─── Base Watcher Contract ─────────────────────────────────────────────

export interface WatcherConfig {
  source: string;
  pollIntervalMs: number;
  needsActionDir: string;
  logsDir: string;
}

/** All Silver watchers implement this interface */
export interface IWatcher {
  readonly source: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  poll(): Promise<void>;
  getState(): WatcherState;
}

export interface WatcherState {
  source: string;
  lastChecked: string;
  status: 'active' | 'error' | 'stopped';
  errorCount: number;
  lastError: string | null;
}

// ─── MCP Client Contract ───────────────────────────────────────────────

export interface MCPServerConfig {
  name: string;          // 'gmail' | 'linkedin'
  command: string;       // 'npx'
  args: string[];        // ['@gongrzhe/server-gmail-mcp']
  env?: Record<string, string>;
}

export interface MCPCallResult {
  success: boolean;
  toolName: string;
  serverName: string;
  response: unknown;
  error?: string;
}

export interface IMCPManager {
  connect(config: MCPServerConfig): Promise<void>;
  callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<MCPCallResult>;
  disconnect(serverName: string): Promise<void>;
  disconnectAll(): Promise<void>;
  isConnected(serverName: string): boolean;
}

// ─── MCP-Aware Skill Contract ──────────────────────────────────────────

/** Extends Bronze SkillResult with MCP metadata */
export interface SilverSkillResult {
  success: boolean;
  output: string;
  filesCreated: string[];
  filesModified: string[];
  requiresApproval: boolean;
  approvalReason: string | null;
  error: string | null;
  mcpCalls?: MCPCallResult[];   // Track MCP interactions
}

/** Silver execution context adds MCP manager */
export interface SilverExecutionContext {
  vaultRoot: string;
  logger: any;           // Bronze Logger
  claudeClient: any;     // Bronze ClaudeClient
  mcpManager: IMCPManager;
  dryRun: boolean;
  handbook: string | null;
  goals: string | null;
}

// ─── LinkedIn Post Contract ────────────────────────────────────────────

export interface LinkedInPostDraft {
  postText: string;           // Max 3000 chars
  targetAudience?: string;
  suggestedTime?: string;     // ISO timestamp
  businessContext?: string;
  approvalStatus: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'published';
  publishResult?: {
    postId?: string;
    postUrl?: string;
    publishedAt?: string;
  };
}

// ─── Scheduled Job Contract ────────────────────────────────────────────

export interface ScheduledJobConfig {
  name: string;
  schedule: string;           // Cron expression or Task Scheduler equivalent
  taskTemplate: {
    frontmatter: SilverTaskFrontmatter;
    body: string;
  };
  enabled: boolean;
}

// ─── Alert Contract ────────────────────────────────────────────────────

export interface AlertFrontmatter {
  type: 'auth_failure' | 'mcp_unreachable' | 'rate_limit' | 'content_rejected';
  source: string;
  created: string;
  resolved: boolean;
}
