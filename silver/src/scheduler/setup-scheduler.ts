import path from 'path';
import { SCHEDULED_JOBS, ScheduledJobConfig } from './job-definitions';

/**
 * Generates OS-native scheduler commands for Silver scheduled jobs.
 *
 * Usage: npx ts-node silver/src/scheduler/setup-scheduler.ts [--install | --uninstall | --show]
 */

const TRIGGER_SCRIPT = 'npx ts-node silver/src/scheduler/trigger.ts';

function generateWindowsCommands(action: 'install' | 'uninstall'): string[] {
  const commands: string[] = [];

  for (const job of SCHEDULED_JOBS) {
    if (!job.enabled) continue;

    const taskName = `AI-Employee-${capitalize(job.name)}`;
    const triggerCmd = `${TRIGGER_SCRIPT} --job ${job.name}`;

    if (action === 'install') {
      const { time, days } = parseCronForWindows(job.schedule);
      let schedArgs = `/sc daily /st ${time}`;
      if (days) {
        schedArgs = `/sc weekly /d ${days} /st ${time}`;
      }
      commands.push(`schtasks /create /tn "${taskName}" /tr "${triggerCmd}" ${schedArgs} /f`);
    } else {
      commands.push(`schtasks /delete /tn "${taskName}" /f`);
    }
  }

  return commands;
}

function generateCronEntries(): string[] {
  const entries: string[] = [];

  for (const job of SCHEDULED_JOBS) {
    if (!job.enabled) continue;
    entries.push(`${job.schedule} cd ${process.cwd()} && ${TRIGGER_SCRIPT} --job ${job.name}`);
  }

  return entries;
}

function parseCronForWindows(cron: string): { time: string; days?: string } {
  const parts = cron.split(' ');
  const minute = parts[0].padStart(2, '0');
  const hour = parts[1].padStart(2, '0');
  const time = `${hour}:${minute}`;

  // Parse day-of-week field
  const dow = parts[4];
  if (dow === '*') {
    return { time };
  }

  const dayMap: Record<string, string> = {
    '0': 'SUN', '1': 'MON', '2': 'TUE', '3': 'WED',
    '4': 'THU', '5': 'FRI', '6': 'SAT', '7': 'SUN',
  };

  const days = dow.split(',').map(d => {
    if (d.includes('-')) {
      const [start, end] = d.split('-').map(Number);
      const result = [];
      for (let i = start; i <= end; i++) {
        result.push(dayMap[String(i)] || String(i));
      }
      return result.join(',');
    }
    return dayMap[d] || d;
  }).join(',');

  return { time, days };
}

function capitalize(s: string): string {
  return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

function main(): void {
  const action = process.argv[2] || '--show';
  const platform = process.platform;

  console.log(`Platform: ${platform}`);
  console.log(`Action: ${action}\n`);

  if (action === '--install' || action === '--uninstall') {
    if (platform === 'win32') {
      const commands = generateWindowsCommands(action === '--install' ? 'install' : 'uninstall');
      console.log('Run these commands to ' + action.replace('--', '') + ' scheduled tasks:\n');
      commands.forEach(cmd => console.log(`  ${cmd}`));
    } else {
      if (action === '--install') {
        const entries = generateCronEntries();
        console.log('Add these entries to your crontab (crontab -e):\n');
        entries.forEach(entry => console.log(`  ${entry}`));
      } else {
        console.log('Remove AI-Employee entries from your crontab (crontab -e).');
      }
    }
  } else {
    console.log('Configured scheduled jobs:\n');
    for (const job of SCHEDULED_JOBS) {
      console.log(`  ${job.name}: ${job.schedule} (${job.enabled ? 'enabled' : 'disabled'})`);
    }
    console.log('\nUsage: setup-scheduler.ts [--install | --uninstall | --show]');
  }
}

main();
