import fs from 'fs';
import path from 'path';
import { parseTaskFile, writeTaskFile, updateTaskStatus } from '../models/task-file';
import { Logger } from '../logging/logger';

export async function processIntake(
  filepath: string,
  needsActionDir: string,
  logger: Logger,
): Promise<void> {
  const filename = path.basename(filepath);
  logger.info('task_intake', `Processing intake: ${filename}`, filename);

  try {
    // Parse and validate (applyDefaults handles missing/invalid fields)
    let task = parseTaskFile(filepath);

    // Ensure status is pending for intake
    task = updateTaskStatus(task, 'pending');

    // Write corrected file to /Needs_Action
    const destPath = writeTaskFile(task, needsActionDir);

    // Remove from /Inbox
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    logger.info('task_intake', `Moved to Needs_Action: ${filename} (priority: ${task.frontmatter.priority})`, filename);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('task_intake', `Failed to process ${filename}: ${message}`, message, filename);
  }
}
