import { AuditLogger } from './audit-logger';
import path from 'path';

function main() {
  const args = process.argv.slice(2);
  const dateIdx = args.indexOf('--date');
  const date = dateIdx >= 0 && args[dateIdx + 1] ? args[dateIdx + 1] : new Date().toISOString().split('T')[0];

  const logsDir = process.env.VAULT_PATH
    ? path.join(process.env.VAULT_PATH, 'Logs')
    : path.resolve(__dirname, '..', '..', '..', 'Logs');

  console.log(`Audit Log Integrity Verification`);
  console.log(`================================`);
  console.log(`Date: ${date}`);
  console.log(`Logs directory: ${logsDir}\n`);

  const logger = new AuditLogger(logsDir, true);
  const entries = logger.getEntriesForDate(date);

  if (entries.length === 0) {
    console.log(`No audit entries found for ${date}.`);
    return;
  }

  console.log(`Total entries: ${entries.length}`);

  const result = logger.verifyIntegrity(date);

  if (result.valid) {
    console.log(`\nResult: INTEGRITY VERIFIED`);
    console.log(`All ${entries.length} entries have valid hash chain.`);
  } else {
    console.log(`\nResult: INTEGRITY BROKEN`);
    console.log(`Hash chain broken at entry index: ${result.brokenAt}`);
    if (result.brokenAt !== null && entries[result.brokenAt]) {
      const broken = entries[result.brokenAt];
      console.log(`\nBroken entry:`);
      console.log(`  Timestamp: ${broken.timestamp}`);
      console.log(`  Actor: ${broken.actor}`);
      console.log(`  Action: ${broken.action}`);
      console.log(`  Previous Hash: ${broken.previousHash}`);
      console.log(`  Entry Hash: ${broken.entryHash}`);
    }
    process.exit(1);
  }

  // Summary of actions
  console.log(`\nAction summary:`);
  const actionCounts: Record<string, number> = {};
  for (const entry of entries) {
    actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1;
  }
  for (const [action, count] of Object.entries(actionCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${action}: ${count}`);
  }

  const financialEntries = entries.filter(e => e.financial !== null);
  if (financialEntries.length > 0) {
    console.log(`\nFinancial entries: ${financialEntries.length}`);
    for (const entry of financialEntries) {
      console.log(`  ${entry.action}: ${entry.financial!.currency} ${entry.financial!.amount} (Odoo ID: ${entry.financial!.odooRecordId})`);
    }
  }
}

main();
