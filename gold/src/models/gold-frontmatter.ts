import { Priority, TaskStatus } from '../../../bronze/src/models/frontmatter';
import { SilverTaskType } from '../../../silver/src/models/extended-frontmatter';

export type GoldTaskType =
  | SilverTaskType
  | 'odoo_invoice'
  | 'odoo_journal'
  | 'social_post'
  | 'ceo_briefing'
  | 'financial_report';

export interface GoldTaskFrontmatter {
  type: GoldTaskType;
  source: string;
  priority: Priority;
  status: TaskStatus;
  created: string;
  source_id?: string;
}

const VALID_GOLD_TYPES: GoldTaskType[] = [
  'file_drop', 'email', 'linkedin_message', 'linkedin_post', 'scheduled', 'whatsapp',
  'odoo_invoice', 'odoo_journal', 'social_post', 'ceo_briefing', 'financial_report',
];

const VALID_PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const VALID_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'done', 'failed'];

export function applyGoldDefaults(raw: Record<string, unknown>): GoldTaskFrontmatter {
  return {
    type: VALID_GOLD_TYPES.includes(raw.type as GoldTaskType) ? (raw.type as GoldTaskType) : 'file_drop',
    source: typeof raw.source === 'string' ? raw.source : 'local',
    priority: VALID_PRIORITIES.includes(raw.priority as Priority) ? (raw.priority as Priority) : 'medium',
    status: VALID_STATUSES.includes(raw.status as TaskStatus) ? (raw.status as TaskStatus) : 'pending',
    created: typeof raw.created === 'string' ? raw.created : new Date().toISOString(),
    source_id: typeof raw.source_id === 'string' ? raw.source_id : undefined,
  };
}

export function validateGoldFrontmatter(data: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (data.type && !VALID_GOLD_TYPES.includes(data.type as GoldTaskType)) {
    errors.push(`Invalid type: ${data.type}. Must be one of: ${VALID_GOLD_TYPES.join(', ')}`);
  }
  if (data.priority && !VALID_PRIORITIES.includes(data.priority as Priority)) {
    errors.push(`Invalid priority: ${data.priority}. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }
  if (data.status && !VALID_STATUSES.includes(data.status as TaskStatus)) {
    errors.push(`Invalid status: ${data.status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}
