import fs from 'fs';
import path from 'path';
import { ZoneOwnership } from '../config/platinum-config';

const DEFAULT_MANIFEST: ZoneOwnership = {
  cloud: ['/Needs_Action', '/Plans', '/Updates', '/Logs'],
  local: ['/Pending_Approval', '/Approved', '/Rejected', '/Done', '/Briefings'],
  localExclusive: ['Dashboard.md', 'Company_Handbook.md', 'Business_Goals.md'],
  sharedRead: ['/Inbox'],
};

export function loadZoneOwnership(vaultRoot: string): ZoneOwnership {
  const manifestPath = path.join(vaultRoot, 'SYNC_OWNERS.json');

  if (fs.existsSync(manifestPath)) {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as ZoneOwnership;
    validateOwnership(parsed);
    return parsed;
  }

  // Fall back to bundled default
  const bundledPath = path.resolve(__dirname, '..', '..', 'SYNC_OWNERS.json');
  if (fs.existsSync(bundledPath)) {
    const raw = fs.readFileSync(bundledPath, 'utf-8');
    const parsed = JSON.parse(raw) as ZoneOwnership;
    validateOwnership(parsed);
    return parsed;
  }

  return DEFAULT_MANIFEST;
}

function validateOwnership(ownership: ZoneOwnership): void {
  const allFolders = [
    ...ownership.cloud,
    ...ownership.local,
    ...ownership.sharedRead,
  ];

  const seen = new Set<string>();
  for (const folder of allFolders) {
    if (seen.has(folder)) {
      throw new Error(`SYNC_OWNERS validation error: folder "${folder}" appears in multiple ownership categories`);
    }
    seen.add(folder);
  }
}
