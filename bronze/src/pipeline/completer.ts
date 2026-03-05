import fs from 'fs';
import path from 'path';
import { parseTaskFile, updateTaskStatus, serializeTaskFile } from '../models/task-file';
import { Logger } from '../logging/logger';

export async function completeTask(
  taskPath: string,
  planPath: string,
  doneDir: string,
  logger: Logger,
): Promise<void> {
  const taskFilename = path.basename(taskPath);

  try {
    // Move task to /Done with status: done
    if (fs.existsSync(taskPath)) {
      const task = parseTaskFile(taskPath);
      const completedTask = updateTaskStatus(task, 'done');
      const destPath = path.join(doneDir, taskFilename);

      fs.writeFileSync(destPath, serializeTaskFile(completedTask), 'utf-8');
      fs.unlinkSync(taskPath);

      logger.info('task_complete', `Task completed: ${taskFilename}`, taskFilename);
    }

    // Move plan to /Done
    if (fs.existsSync(planPath)) {
      const planFilename = path.basename(planPath);
      const destPath = path.join(doneDir, planFilename);
      fs.copyFileSync(planPath, destPath);
      fs.unlinkSync(planPath);

      logger.info('plan_complete', `Plan archived: ${planFilename}`, taskFilename);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('complete_error', `Error completing ${taskFilename}: ${msg}`, msg, taskFilename);
  }
}
