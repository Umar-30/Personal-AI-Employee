import { AgentMode } from '../config/platinum-config';

// Skills that execute external actions — blocked on cloud
const CLOUD_BLOCKED_SKILLS = [
  'SendEmailSkill',
  'LinkedInPostSkill',
  'OdooInvoiceSkill',
  'SocialPostSkill',
];

// Skills safe for cloud (draft-only, read-only, or internal)
const CLOUD_ALLOWED_SKILLS = [
  'SummarizeSkill',
  'DraftEmailSkill',
  'DashboardSkill',
  'GenericReasoningSkill',
  'OdooReportSkill',
  'CEOBriefingSkill',
  'DailyBriefingSkill',
];

export function getSkillsForMode(mode: AgentMode): { allowed: string[]; blocked: string[] } {
  if (mode === 'cloud') {
    return {
      allowed: CLOUD_ALLOWED_SKILLS,
      blocked: CLOUD_BLOCKED_SKILLS,
    };
  }

  // Local mode: all skills allowed
  return {
    allowed: [...CLOUD_ALLOWED_SKILLS, ...CLOUD_BLOCKED_SKILLS],
    blocked: [],
  };
}

export function isSkillAllowedForMode(skillName: string, mode: AgentMode): boolean {
  if (mode === 'local') return true;
  return !CLOUD_BLOCKED_SKILLS.includes(skillName);
}
