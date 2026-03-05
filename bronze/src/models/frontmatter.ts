export type TaskType = 'file_drop' | 'email' | 'whatsapp';
export type Priority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'failed';

export interface TaskFrontmatter {
  type: TaskType;
  source: string;
  priority: Priority;
  status: TaskStatus;
  created: string;
}

const VALID_TYPES: TaskType[] = ['file_drop', 'email', 'whatsapp'];
const VALID_PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const VALID_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'done', 'failed'];

export function applyDefaults(raw: Record<string, unknown>): TaskFrontmatter {
  return {
    type: VALID_TYPES.includes(raw.type as TaskType) ? (raw.type as TaskType) : 'file_drop',
    source: typeof raw.source === 'string' ? raw.source : 'local',
    priority: VALID_PRIORITIES.includes(raw.priority as Priority) ? (raw.priority as Priority) : 'medium',
    status: VALID_STATUSES.includes(raw.status as TaskStatus) ? (raw.status as TaskStatus) : 'pending',
    created: typeof raw.created === 'string' ? raw.created : new Date().toISOString(),
  };
}

export function validateFrontmatter(data: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (data.type && !VALID_TYPES.includes(data.type as TaskType)) {
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
