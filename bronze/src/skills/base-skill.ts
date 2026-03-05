import { TaskFile } from '../models/task-file';
import { Logger } from '../logging/logger';
import { ClaudeClient } from '../claude/claude-client';

export interface SkillResult {
  success: boolean;
  output: string;
  filesCreated: string[];
  filesModified: string[];
  requiresApproval: boolean;
  approvalReason: string | null;
  error: string | null;
}

export interface ExecutionContext {
  vaultRoot: string;
  logger: Logger;
  claudeClient: ClaudeClient;
  dryRun: boolean;
  handbook: string | null;
  goals: string | null;
}

export interface BaseSkill {
  name: string;
  canHandle(task: TaskFile): boolean;
  execute(task: TaskFile, context: ExecutionContext): Promise<SkillResult>;
}

export function makeSuccessResult(output: string, filesCreated: string[] = [], filesModified: string[] = []): SkillResult {
  return {
    success: true,
    output,
    filesCreated,
    filesModified,
    requiresApproval: false,
    approvalReason: null,
    error: null,
  };
}

export function makeErrorResult(error: string): SkillResult {
  return {
    success: false,
    output: '',
    filesCreated: [],
    filesModified: [],
    requiresApproval: false,
    approvalReason: null,
    error,
  };
}

export function makeApprovalResult(reason: string): SkillResult {
  return {
    success: false,
    output: '',
    filesCreated: [],
    filesModified: [],
    requiresApproval: true,
    approvalReason: reason,
    error: null,
  };
}
