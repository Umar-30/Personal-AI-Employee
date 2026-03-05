import fs from 'fs';
import path from 'path';
import { loadPlatinumConfig } from '../config/platinum-config';

const POLL_INTERVAL_MS = 5000;
const TIMEOUT_MS = 120000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForFile(dir: string, pattern: RegExp, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        resolve(null);
        return;
      }

      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => pattern.test(f));
        if (files.length > 0) {
          resolve(path.join(dir, files[0]));
          return;
        }
      }

      setTimeout(check, POLL_INTERVAL_MS);
    };
    check();
  });
}

async function runDemo(): Promise<void> {
  const config = loadPlatinumConfig();
  const vaultRoot = config.vaultPath;
  const results: { step: string; pass: boolean; detail: string }[] = [];

  console.log('=== Platinum Tier End-to-End Demo ===\n');
  console.log(`Vault: ${vaultRoot}`);
  console.log(`Agent Mode: ${config.agentMode}\n`);

  // Step 1: Copy demo fixture to Inbox
  console.log('Step 1: Placing demo email task in /Inbox...');
  const fixtureSource = path.resolve(__dirname, '..', '..', 'tests', 'fixtures', 'demo-email-task.md');
  const inboxDest = path.join(vaultRoot, 'Inbox', `demo-email-${Date.now()}.md`);

  try {
    fs.copyFileSync(fixtureSource, inboxDest);
    results.push({ step: 'Place task in Inbox', pass: true, detail: inboxDest });
    console.log(`  PASS: Task placed at ${inboxDest}\n`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ step: 'Place task in Inbox', pass: false, detail: msg });
    console.log(`  FAIL: ${msg}\n`);
  }

  // Step 2: Wait for cloud agent to process → /Pending_Approval
  console.log('Step 2: Waiting for draft in /Pending_Approval (timeout: 120s)...');
  const pendingDir = path.join(vaultRoot, 'Pending_Approval');
  const pendingFile = await waitForFile(pendingDir, /demo|email|partnership/i, TIMEOUT_MS);

  if (pendingFile) {
    results.push({ step: 'Cloud drafts reply', pass: true, detail: pendingFile });
    console.log(`  PASS: Draft found at ${pendingFile}\n`);
  } else {
    results.push({ step: 'Cloud drafts reply', pass: false, detail: 'Timeout waiting for draft in /Pending_Approval' });
    console.log('  FAIL: Timeout — no draft found in /Pending_Approval\n');
    console.log('  (Is the cloud agent running? Check `npm run start:platinum` with AGENT_MODE=cloud)\n');
  }

  // Step 3: Simulate approval by moving to /Approved
  console.log('Step 3: Simulating approval (move to /Approved)...');
  if (pendingFile && fs.existsSync(pendingFile)) {
    const approvedDir = path.join(vaultRoot, 'Approved');
    const approvedDest = path.join(approvedDir, path.basename(pendingFile));

    try {
      if (!fs.existsSync(approvedDir)) fs.mkdirSync(approvedDir, { recursive: true });
      fs.renameSync(pendingFile, approvedDest);
      results.push({ step: 'Simulate approval', pass: true, detail: approvedDest });
      console.log(`  PASS: Moved to ${approvedDest}\n`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ step: 'Simulate approval', pass: false, detail: msg });
      console.log(`  FAIL: ${msg}\n`);
    }
  } else {
    results.push({ step: 'Simulate approval', pass: false, detail: 'No pending file to approve' });
    console.log('  SKIP: No pending file to approve\n');
  }

  // Step 4: Wait for task to appear in /Done
  console.log('Step 4: Waiting for completed task in /Done (timeout: 120s)...');
  const doneDir = path.join(vaultRoot, 'Done');
  const doneFile = await waitForFile(doneDir, /demo|email|partnership/i, TIMEOUT_MS);

  if (doneFile) {
    results.push({ step: 'Task completed in /Done', pass: true, detail: doneFile });
    console.log(`  PASS: Task completed at ${doneFile}\n`);
  } else {
    results.push({ step: 'Task completed in /Done', pass: false, detail: 'Timeout waiting for task in /Done' });
    console.log('  FAIL: Timeout — no completed task in /Done\n');
  }

  // Step 5: Check audit trail
  console.log('Step 5: Checking audit trail...');
  const logsDir = path.join(vaultRoot, 'Logs');
  const today = new Date().toISOString().split('T')[0];
  // Audit logger writes .json; fall back to .jsonl for compatibility
  const auditFile = fs.existsSync(path.join(logsDir, `${today}.json`))
    ? path.join(logsDir, `${today}.json`)
    : path.join(logsDir, `${today}.jsonl`);

  if (fs.existsSync(auditFile)) {
    const content = fs.readFileSync(auditFile, 'utf-8');
    const hasEntries = content.includes('email') || content.includes('demo') || content.length > 0;
    results.push({ step: 'Audit trail exists', pass: hasEntries, detail: auditFile });
    console.log(`  ${hasEntries ? 'PASS' : 'WARN'}: Audit log at ${auditFile}\n`);
  } else {
    results.push({ step: 'Audit trail exists', pass: false, detail: 'No audit log for today' });
    console.log('  FAIL: No audit log found for today\n');
  }

  // Summary
  console.log('\n=== Demo Results ===\n');
  const passed = results.filter(r => r.pass).length;
  const total = results.length;

  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'} — ${r.step}`);
    console.log(`         ${r.detail}`);
  }

  console.log(`\n  Result: ${passed}/${total} steps passed\n`);

  process.exit(passed === total ? 0 : 1);
}

// Run when executed directly
runDemo().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
