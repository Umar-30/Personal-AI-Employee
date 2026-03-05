import { SCHEDULED_JOBS } from '../../../silver/src/scheduler/job-definitions';

export interface GoldScheduledJobConfig {
  name: string;
  schedule: string;
  taskTemplate: {
    frontmatter: Record<string, unknown>;
    body: string;
  };
  enabled: boolean;
}

export const GOLD_SCHEDULED_JOBS: GoldScheduledJobConfig[] = [
  ...SCHEDULED_JOBS.map(j => ({
    ...j,
    taskTemplate: {
      frontmatter: j.taskTemplate.frontmatter as unknown as Record<string, unknown>,
      body: j.taskTemplate.body,
    },
  })),
  {
    name: 'weekly-ceo-briefing',
    schedule: '0 7 * * 0', // Sunday 7AM
    taskTemplate: {
      frontmatter: {
        type: 'ceo_briefing',
        source: 'scheduler',
        priority: 'high',
        status: 'pending',
      },
      body: 'Generate the weekly Monday Morning CEO Briefing.\n\nAnalyze business goals, bank transactions, completed work, and accounting data.\nInclude: Revenue summary, Bottleneck analysis, Subscription audit, Risk assessment, Proactive recommendations.',
    },
    enabled: true,
  },
];

export function getGoldJobByName(name: string): GoldScheduledJobConfig | undefined {
  return GOLD_SCHEDULED_JOBS.find(j => j.name === name);
}
