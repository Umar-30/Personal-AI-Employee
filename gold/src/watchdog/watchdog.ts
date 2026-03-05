import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

interface WatchdogState {
  daemonStatus: 'running' | 'stopped' | 'restarting' | 'failed';
  restartCount: number;
  lastCheck: string;
  lastRestart: string | null;
}

const DEFAULT_PID_FILE = path.resolve(__dirname, '..', '..', 'gold-daemon.pid');
const MAX_RESTARTS = parseInt(process.env.WATCHDOG_MAX_RESTARTS || '10', 10);
const CHECK_INTERVAL_MS = parseInt(process.env.WATCHDOG_CHECK_INTERVAL_MS || '30000', 10);
const DAEMON_COMMAND = 'npx';
const DAEMON_ARGS = ['ts-node', path.resolve(__dirname, '..', 'index.ts')];
const LOG_FILE = path.resolve(__dirname, '..', '..', 'watchdog.log');

const state: WatchdogState = {
  daemonStatus: 'stopped',
  restartCount: 0,
  lastCheck: new Date().toISOString(),
  lastRestart: null,
};

function log(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [watchdog] ${message}\n`;
  process.stderr.write(line);
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch { /* ignore log write errors */ }
}

function readPid(): number | null {
  try {
    const pidStr = fs.readFileSync(DEFAULT_PID_FILE, 'utf-8').trim();
    const pid = parseInt(pidStr, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function cleanStalePid(): void {
  try {
    if (fs.existsSync(DEFAULT_PID_FILE)) {
      fs.unlinkSync(DEFAULT_PID_FILE);
      log('Cleaned stale PID file');
    }
  } catch { /* ignore */ }
}

function restartDaemon(): void {
  if (state.restartCount >= MAX_RESTARTS) {
    state.daemonStatus = 'failed';
    log(`CRITICAL: Max restarts (${MAX_RESTARTS}) reached. Stopping watchdog. Manual intervention required.`);

    // Create critical alert file
    const alertDir = process.env.VAULT_PATH ? path.join(process.env.VAULT_PATH, 'Needs_Action') : undefined;
    if (alertDir && fs.existsSync(alertDir)) {
      const alertFile = path.join(alertDir, `ALERT_watchdog_max_restarts_${Date.now()}.md`);
      fs.writeFileSync(alertFile, `---\ntype: alert\npriority: high\nstatus: pending\ncreated: ${new Date().toISOString()}\n---\n\nCRITICAL: Gold daemon watchdog has exhausted max restart attempts (${MAX_RESTARTS}).\nManual restart required.\n`, 'utf-8');
    }
    return;
  }

  state.daemonStatus = 'restarting';
  state.restartCount++;
  state.lastRestart = new Date().toISOString();

  log(`Restarting daemon (attempt ${state.restartCount}/${MAX_RESTARTS})...`);

  cleanStalePid();

  const child = spawn(DAEMON_COMMAND, DAEMON_ARGS, {
    detached: true,
    stdio: 'ignore',
    cwd: path.resolve(__dirname, '..', '..', '..'),
  });

  child.unref();
  log(`Daemon spawned with PID: ${child.pid}`);
  state.daemonStatus = 'running';
}

function check(): void {
  state.lastCheck = new Date().toISOString();

  const pid = readPid();

  if (pid === null) {
    log('No PID file found. Daemon may not be running.');
    state.daemonStatus = 'stopped';
    restartDaemon();
    return;
  }

  if (isProcessRunning(pid)) {
    state.daemonStatus = 'running';
    state.restartCount = 0; // Reset on successful check
    return;
  }

  log(`Daemon PID ${pid} is no longer running. Restarting...`);
  state.daemonStatus = 'stopped';
  restartDaemon();
}

// Run mode: single check or continuous
const args = process.argv.slice(2);
const continuous = args.includes('--continuous') || args.includes('-c');

if (continuous) {
  log(`Watchdog starting in continuous mode (interval: ${CHECK_INTERVAL_MS}ms, max restarts: ${MAX_RESTARTS})`);
  check();
  setInterval(check, CHECK_INTERVAL_MS);

  process.on('SIGINT', () => {
    log('Watchdog shutting down');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    log('Watchdog shutting down');
    process.exit(0);
  });
} else {
  // Single check mode (for OS scheduler)
  log('Watchdog performing single check');
  check();
  log(`Status: ${JSON.stringify(state)}`);
}
