import { Priority, TaskStatus } from '../../../bronze/src/models/frontmatter';

export type SilverTaskType = 'file_drop' | 'email' | 'linkedin_message' | 'linkedin_post' | 'scheduled' | 'whatsapp' | 'whatsapp_message';

export interface SilverTaskFrontmatter {
  type: SilverTaskType;
  source: string;
  priority: Priority;
  status: TaskStatus;
  created: string;
  source_id?: string;
}

const VALID_TYPES: SilverTaskType[] = ['file_drop', 'email', 'linkedin_message', 'linkedin_post', 'scheduled', 'whatsapp', 'whatsapp_message'];
const VALID_PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const VALID_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'done', 'failed'];

export function applySilverDefaults(raw: Record<string, unknown>): SilverTaskFrontmatter {
  return {
    type: VALID_TYPES.includes(raw.type as SilverTaskType) ? (raw.type as SilverTaskType) : 'file_drop',
    source: typeof raw.source === 'string' ? raw.source : 'local',
    priority: VALID_PRIORITIES.includes(raw.priority as Priority) ? (raw.priority as Priority) : 'medium',
    status: VALID_STATUSES.includes(raw.status as TaskStatus) ? (raw.status as TaskStatus) : 'pending',
    created: typeof raw.created === 'string' ? raw.created : new Date().toISOString(),
    source_id: typeof raw.source_id === 'string' ? raw.source_id : undefined,
  };
}

export function validateSilverFrontmatter(data: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (data.type && !VALID_TYPES.includes(data.type as SilverTaskType)) {
    errors.push(`Invalid type: ${data.type}. Must be one of: ${VALID_TYPES.join(', ')}`);
  }
  if (data.priority && !VALID_PRIORITIES.includes(data.priority as Priority)) {
    errors.push(`Invalid priority: ${data.priority}. Must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }
  if (data.status && !VALID_STATUSES.includes(data.status as TaskStatus)) {
    errors.push(`Invalid status: ${data.status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}
