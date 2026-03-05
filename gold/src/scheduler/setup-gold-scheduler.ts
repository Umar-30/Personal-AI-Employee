import { GOLD_SCHEDULED_JOBS } from './gold-job-definitions';
import path from 'path';

const isWindows = process.platform === 'win32';

function generateSchedulerCommands(): string[] {
  const commands: string[] = [];
  const projectRoot = path.resolve(__dirname, '..', '..', '..');

  for (const job of GOLD_SCHEDULED_JOBS) {
    if (!job.enabled) continue;

    const triggerCmd = `npx ts-node "${path.join(projectRoot, 'gold', 'src', 'scheduler', 'trigger.ts')}" --job ${job.name}`;

    if (isWindows) {
      const parts = job.schedule.split(' ');
      const [minute, hour, , , dayOfWeek] = parts;

      let scheduleType = '/sc DAILY';
      let dayFlag = '';

      if (dayOfWeek === '0' || dayOfWeek === '7') {
        scheduleType = '/sc WEEKLY';
        dayFlag = '/d SUN';
      } else if (dayOfWeek === '1-5') {
        scheduleType = '/sc WEEKLY';
        dayFlag = '/d MON,TUE,WED,THU,FRI';
      } else if (dayOfWeek !== '*') {
        scheduleType = '/sc WEEKLY';
        const dayMap: Record<string, string> = { '0': 'SUN', '1': 'MON', '2': 'TUE', '3': 'WED', '4': 'THU', '5': 'FRI', '6': 'SAT' };
        dayFlag = `/d ${dayMap[dayOfWeek] || 'MON'}`;
      }

      const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      commands.push(`schtasks /create /tn "AIEmployee_Gold_${job.name}" ${scheduleType} ${dayFlag} /st ${time} /tr "${triggerCmd}" /f`);
    } else {
      commands.push(`# ${job.name}: ${job.schedule}`);
      commands.push(`(crontab -l 2>/dev/null; echo "${job.schedule} cd ${projectRoot} && ${triggerCmd}") | crontab -`);
    }
  }

  // Add watchdog job
  if (isWindows) {
    const watchdogCmd = `npx ts-node "${path.join(projectRoot, 'gold', 'src', 'watchdog', 'watchdog.ts')}"`;
    commands.push(`schtasks /create /tn "AIEmployee_Gold_watchdog" /sc MINUTE /mo 1 /tr "${watchdogCmd}" /f`);
  } else {
    const watchdogCmd = `cd ${projectRoot} && npx ts-node gold/src/watchdog/watchdog.ts`;
    commands.push(`# watchdog: every minute`);
    commands.push(`(crontab -l 2>/dev/null; echo "* * * * * ${watchdogCmd}") | crontab -`);
  }

  return commands;
}

function main() {
  console.log('Gold Tier Scheduler Setup');
  console.log('========================\n');

  const commands = generateSchedulerCommands();

  console.log('Commands to install scheduled jobs:\n');
  for (const cmd of commands) {
    console.log(cmd);
  }

  console.log('\nRun these commands to install the scheduler jobs.');
  console.log('To uninstall, remove the tasks/crontab entries manually.');
}

main();
