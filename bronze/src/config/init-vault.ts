import fs from 'fs';
import path from 'path';
import { loadConfig } from './config';

const VAULT_FOLDERS = [
  'Inbox',
  'Needs_Action',
  'Plans',
  'Pending_Approval',
  'Approved',
  'Rejected',
  'Done',
  'Logs',
  'Briefings',
  'Updates',
  'Sync_Conflicts',
];

const DASHBOARD_TEMPLATE = `# Dashboard
**Updated**: ${new Date().toISOString()}

| Folder | Count |
|--------|-------|
| Inbox | 0 |
| Needs Action | 0 |
| Plans | 0 |
| Pending Approval | 0 |
| Approved | 0 |
| Done | 0 |

## Recent Activity
- No activity yet.
`;

const HANDBOOK_TEMPLATE = `# Company Handbook

## General Rules
- All actions must be logged.
- Sensitive actions require approval.
- No secrets in vault files.

## Communication Policy
- Draft emails before sending.
- Verify recipient before first contact.

## Financial Policy
- All payments require explicit approval.
- Keep receipts and records.
`;

function initVault(): void {
  const config = loadConfig();
  const vaultPath = config.vaultPath;

  console.log(`Initializing vault at: ${vaultPath}`);

  // Create vault root if needed
  if (!fs.existsSync(vaultPath)) {
    fs.mkdirSync(vaultPath, { recursive: true });
  }

  // Create folders
  for (const folder of VAULT_FOLDERS) {
    const folderPath = path.join(vaultPath, folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      console.log(`  Created: ${folder}/`);
    } else {
      console.log(`  Exists:  ${folder}/`);
    }
  }

  // Create Dashboard.md if missing
  if (!fs.existsSync(config.files.dashboard)) {
    fs.writeFileSync(config.files.dashboard, DASHBOARD_TEMPLATE, 'utf-8');
    console.log('  Created: Dashboard.md');
  } else {
    console.log('  Exists:  Dashboard.md');
  }

  // Create Company_Handbook.md if missing
  if (!fs.existsSync(config.files.handbook)) {
    fs.writeFileSync(config.files.handbook, HANDBOOK_TEMPLATE, 'utf-8');
    console.log('  Created: Company_Handbook.md');
  } else {
    console.log('  Exists:  Company_Handbook.md');
  }

  console.log('\nVault initialization complete.');
}

// Run when executed directly
initVault();
