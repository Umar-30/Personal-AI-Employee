import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { getGoldJobByName } from './gold-job-definitions';

/**
 * CLI trigger script for Gold scheduled jobs.
 * Invoked by OS scheduler (schtasks/cron) to create a task file in /Inbox.
 *
 * Usage: npx ts-node gold/src/scheduler/trigger.ts --job <name>
 */

function main(): void {
  const args = process.argv.slice(2);
  const jobIndex = args.indexOf('--job');

  if (jobIndex === -1 || !args[jobIndex + 1]) {
    console.error('Usage: trigger.ts --job <job-name>');
    console.error('Available Gold jobs: weekly-ceo-briefing, daily-briefing, linkedin-post');
    process.exit(1);
  }

  const jobName = args[jobIndex + 1];
  const job = getGoldJobByName(jobName);

  if (!job) {
    console.error(`Unknown job: ${jobName}`);
    process.exit(1);
  }

  if (!job.enabled) {
    console.log(`Job ${jobName} is disabled. Skipping.`);
    process.exit(0);
  }

  const vaultPath = process.env.VAULT_PATH || process.cwd();
  const inboxDir = path.join(vaultPath, 'Inbox');

  if (!fs.existsSync(inboxDir)) {
    fs.mkdirSync(inboxDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const frontmatter = {
    ...job.taskTemplate.frontmatter,
    created: timestamp,
  };

  const slug = `${jobName}-${timestamp.replace(/[:.]/g, '-')}`;
  const filename = `${slug}.md`;
  const filepath = path.join(inboxDir, filename);

  const content = matter.stringify(job.taskTemplate.body, frontmatter as Record<string, unknown>);
  fs.writeFileSync(filepath, content, 'utf-8');

  console.log(`Gold scheduled task created: ${filepath}`);
}

main();
