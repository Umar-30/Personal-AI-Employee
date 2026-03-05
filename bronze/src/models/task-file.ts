import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { TaskFrontmatter, applyDefaults, validateFrontmatter } from './frontmatter';

export interface TaskFile {
  filename: string;
  filepath: string;
  frontmatter: TaskFrontmatter;
  body: string;
  raw: string;
}

export function parseTaskFile(filepath: string): TaskFile {
  const raw = fs.readFileSync(filepath, 'utf-8');
  const parsed = matter(raw);
  const frontmatter = applyDefaults(parsed.data as Record<string, unknown>);

  return {
    filename: path.basename(filepath),
    filepath,
    frontmatter,
    body: parsed.content.trim(),
    raw,
  };
}

export function serializeTaskFile(task: TaskFile): string {
  return matter.stringify(task.body, task.frontmatter as unknown as Record<string, unknown>);
}

export function updateTaskStatus(task: TaskFile, status: TaskFrontmatter['status']): TaskFile {
  return {
    ...task,
    frontmatter: { ...task.frontmatter, status },
  };
}

export function writeTaskFile(task: TaskFile, destDir: string): string {
  const destPath = path.join(destDir, task.filename);
  fs.writeFileSync(destPath, serializeTaskFile(task), 'utf-8');
  return destPath;
}

export function slugFromFilename(filename: string): string {
  return path.basename(filename, '.md');
}

export { validateFrontmatter };
