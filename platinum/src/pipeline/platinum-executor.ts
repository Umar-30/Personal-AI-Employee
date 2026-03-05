import { PlanFile, markStepComplete, writePlanFile } from '../../../bronze/src/models/plan-file';
import { SkillRegistry } from '../../../bronze/src/skills/skill-registry';
import { GoldExecutionContext, executeGoldTaskPlan } from '../../../gold/src/pipeline/gold-executor';
import { AuditLogger } from '../../../gold/src/logging/audit-logger';
import { ZoneGuard } from '../zone/zone-guard';
import { AgentMode } from '../config/platinum-config';
import { Logger } from '../../../bronze/src/logging/logger';

export interface IRateLimiter {
  canProceed(serviceKey: string): boolean;
  recordRequest(serviceKey: string): void;
  getWaitTime(serviceKey: string): number;
}

export interface IHealthMonitor {
  isServiceHealthy(name: string): boolean;
}

export interface PlatinumExecutionContext extends GoldExecutionContext {
  agentMode: AgentMode;
  zoneGuard: ZoneGuard;
  rateLimiter: IRateLimiter;
  healthMonitor: IHealthMonitor;
}

export async function executePlatinumTaskPlan(
  plan: PlanFile,
  skillRegistry: SkillRegistry,
  context: PlatinumExecutionContext,
): Promise<void> {
  const { logger, auditLogger, agentMode, zoneGuard, rateLimiter } = context;

  logger.info('platinum_executor', `Executing plan (mode: ${agentMode}): ${plan.filepath}`);

  auditLogger.log({
    actor: `platinum-daemon-${agentMode}`,
    action: 'plan_execution_start',
    parameters: { planRef: plan.filepath, agentMode },
    approvalStatus: 'not_required',
    result: { success: true, detail: `Started plan execution in ${agentMode} mode`, duration_ms: 0 },
    financial: null,
  });

  // Delegate to Gold executor — it handles step iteration, skill dispatch, audit logging
  // The ZoneGuard is available in context for skills that need to check write permissions
  await executeGoldTaskPlan(plan, skillRegistry, context);

  auditLogger.log({
    actor: `platinum-daemon-${agentMode}`,
    action: 'plan_execution_complete',
    parameters: { planRef: plan.filepath, agentMode },
    approvalStatus: 'not_required',
    result: { success: true, detail: `Completed plan execution in ${agentMode} mode`, duration_ms: 0 },
    financial: null,
  });
}
