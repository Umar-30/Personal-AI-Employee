import { SilverTaskFrontmatter } from '../models/extended-frontmatter';

export interface ScheduledJobConfig {
  name: string;
  schedule: string;
  taskTemplate: {
    frontmatter: SilverTaskFrontmatter;
    body: string;
  };
  enabled: boolean;
}

export const SCHEDULED_JOBS: ScheduledJobConfig[] = [
  {
    name: 'daily-briefing',
    schedule: '0 7 * * *', // 7:00 AM daily
    taskTemplate: {
      frontmatter: {
        type: 'scheduled',
        source: 'scheduler',
        priority: 'medium',
        status: 'pending',
        created: '', // filled at runtime
      },
      body: '# Daily Briefing Request\n\nGenerate the daily executive briefing summarizing all vault activity, pending tasks, completed work, and upcoming priorities.',
    },
    enabled: true,
  },
  {
    name: 'linkedin-post',
    schedule: '0 9 * * 1-5', // 9:00 AM weekdays
    taskTemplate: {
      frontmatter: {
        type: 'linkedin_post',
        source: 'scheduler',
        priority: 'medium',
        status: 'pending',
        created: '', // filled at runtime
      },
      body: '# LinkedIn Sales Post\n\nGenerate and publish a sales-oriented LinkedIn post based on current business goals, recent achievements, and industry context.',
    },
    enabled: true,
  },
];

export function getJobByName(name: string): ScheduledJobConfig | undefined {
  return SCHEDULED_JOBS.find(j => j.name === name);
}
