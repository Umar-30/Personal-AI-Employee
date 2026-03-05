import { loadPlatinumConfig } from '../config/platinum-config';
import { VaultSync } from './vault-sync';
import { loadZoneOwnership } from './sync-owners';
import { ensureVaultGitignore } from './vault-gitignore';
import { Logger } from '../../../bronze/src/logging/logger';

async function manualSync(): Promise<void> {
  const config = loadPlatinumConfig();
  const logger = new Logger(config.vaultPath, config.logLevel);

  if (!config.sync.enabled) {
    console.log('Vault sync is disabled (VAULT_SYNC_ENABLED=false)');
    process.exit(0);
  }

  if (!config.sync.remoteUrl) {
    console.error('Error: VAULT_SYNC_REMOTE_URL is not configured');
    process.exit(1);
  }

  console.log(`Syncing vault: ${config.vaultPath}`);
  console.log(`Remote: ${config.sync.remoteUrl}`);
  console.log(`Branch: ${config.sync.branch}`);
  console.log(`Agent mode: ${config.agentMode}`);
  console.log();

  // Ensure .gitignore is in place
  ensureVaultGitignore(config.vaultPath);

  const ownership = loadZoneOwnership(config.vaultPath);
  const vaultSync = new VaultSync(
    config.vaultPath,
    config.sync,
    ownership,
    config.agentMode,
    logger,
  );

  const result = await vaultSync.sync();

  console.log(`\nSync result:`);
  console.log(`  Success: ${result.success}`);
  console.log(`  Files changed: ${result.filesChanged}`);
  console.log(`  Conflicts: ${result.conflictsDetected} detected, ${result.conflictsResolved} resolved`);
  console.log(`  Duration: ${result.durationMs}ms`);

  if (result.errors.length > 0) {
    console.log(`  Errors:`);
    for (const err of result.errors) {
      console.log(`    - ${err}`);
    }
  }

  process.exit(result.success ? 0 : 1);
}

manualSync().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
