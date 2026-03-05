import { BaseSkill, SkillResult, ExecutionContext, makeErrorResult } from './base-skill';
import { TaskFile } from '../models/task-file';

interface RegisteredSkill {
  skill: BaseSkill;
  priority: number;
}

export class SkillRegistry {
  private skills: RegisteredSkill[] = [];

  register(skill: BaseSkill, priority: number): void {
    this.skills.push({ skill, priority });
    this.skills.sort((a, b) => a.priority - b.priority);
  }

  async dispatch(task: TaskFile, context: ExecutionContext): Promise<SkillResult> {
    for (const { skill } of this.skills) {
      if (skill.canHandle(task)) {
        context.logger.info('skill_dispatch', `Dispatching to skill: ${skill.name}`, task.filename);
        try {
          return await skill.execute(task, context);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          context.logger.error('skill_error', `Skill ${skill.name} threw: ${message}`, message, task.filename);
          return makeErrorResult(`Skill ${skill.name} failed: ${message}`);
        }
      }
    }

    return makeErrorResult('No skill found for task');
  }

  getRegisteredSkills(): Array<{ name: string; priority: number }> {
    return this.skills.map(s => ({ name: s.skill.name, priority: s.priority }));
  }
}
