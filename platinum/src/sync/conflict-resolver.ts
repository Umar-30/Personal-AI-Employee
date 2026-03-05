import { ZoneOwnership, AgentMode } from '../config/platinum-config';
import { Logger } from '../../../bronze/src/logging/logger';
import fs from 'fs';
import path from 'path';

export interface SyncConflictRecord {
  timestamp: string;
  filePath: string;
  resolution: 'cloud_wins' | 'local_wins';
  stashedPath: string;
}

export class ConflictResolver {
  private ownership: ZoneOwnership;
  private agentMode: AgentMode;
  private logger: Logger;
  private vaultRoot: string;

  constructor(ownership: ZoneOwnership, agentMode: AgentMode, logger: Logger, vaultRoot: string) {
    this.ownership = ownership;
    this.agentMode = agentMode;
    this.logger = logger;
    this.vaultRoot = vaultRoot;
  }

  async resolve(conflictFiles: string[]): Promise<SyncConflictRecord[]> {
    const records: SyncConflictRecord[] = [];
    const today = new Date().toISOString().split('T')[0];
    const stashDir = path.join(this.vaultRoot, 'Sync_Conflicts', today);

    if (!fs.existsSync(stashDir)) {
      fs.mkdirSync(stashDir, { recursive: true });
    }

    for (const file of conflictFiles) {
      const owner = this.getFileOwner(file);
      const resolution: 'cloud_wins' | 'local_wins' = owner === 'cloud' ? 'cloud_wins' : 'local_wins';

      // Stash the losing version
      const stashedPath = path.join(stashDir, `${path.basename(file)}.${this.agentMode === owner ? 'remote' : 'local'}`);
      const filePath = path.join(this.vaultRoot, file);

      try {
        // If we're the owner, keep our version (checkout --ours)
        // If we're not the owner, keep theirs (checkout --theirs)
        if (this.agentMode === owner) {
          // We own this file — stash remote version, keep ours
          this.logger.info('conflict_resolve', `${file}: ${this.agentMode} owns → keeping ours, stashing theirs`);
        } else {
          // They own this file — stash our version, keep theirs
          if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, stashedPath);
          }
          this.logger.info('conflict_resolve', `${file}: ${owner} owns → keeping theirs, stashing ours`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn('conflict_resolve', `Failed to stash conflict for ${file}: ${msg}`);
      }

      records.push({
        timestamp: new Date().toISOString(),
        filePath: file,
        resolution,
        stashedPath,
      });
    }

    this.logger.info('conflict_resolve', `Resolved ${records.length} conflicts`);
    return records;
  }

  private getFileOwner(filePath: string): AgentMode {
    const normalized = filePath.startsWith('/') ? filePath : `/${filePath}`;

    // Check local exclusive files (root-level)
    for (const exclusive of this.ownership.localExclusive) {
      if (normalized === `/${exclusive}` || filePath === exclusive) {
        return 'local';
      }
    }

    // Check folder ownership
    for (const folder of this.ownership.cloud) {
      if (normalized.startsWith(folder + '/') || normalized === folder) {
        return 'cloud';
      }
    }

    for (const folder of this.ownership.local) {
      if (normalized.startsWith(folder + '/') || normalized === folder) {
        return 'local';
      }
    }

    // Default: local owns unclassified files
    return 'local';
  }
}
