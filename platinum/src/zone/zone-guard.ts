import { AgentMode, ZoneOwnership } from '../config/platinum-config';
import { Logger } from '../../../bronze/src/logging/logger';
import path from 'path';

export class ZoneViolationError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly attemptedBy: AgentMode,
    public readonly ownedBy: AgentMode | 'shared',
  ) {
    super(`Zone violation: ${attemptedBy} agent cannot write to ${filePath} (owned by ${ownedBy})`);
    this.name = 'ZoneViolationError';
  }
}

export class ZoneGuard {
  private agentMode: AgentMode;
  private ownership: ZoneOwnership;
  private vaultRoot: string;
  private logger: Logger;

  constructor(agentMode: AgentMode, ownership: ZoneOwnership, vaultRoot: string, logger: Logger) {
    this.agentMode = agentMode;
    this.ownership = ownership;
    this.vaultRoot = vaultRoot;
    this.logger = logger;
  }

  canWrite(vaultRelativePath: string): boolean {
    const owner = this.getOwner(vaultRelativePath);

    if (owner === 'shared') return true;
    if (owner === this.agentMode) return true;

    return false;
  }

  assertWrite(vaultRelativePath: string): void {
    if (!this.canWrite(vaultRelativePath)) {
      const owner = this.getOwner(vaultRelativePath);
      this.logger.warn('zone_guard', `Blocked write to ${vaultRelativePath} by ${this.agentMode} (owned by ${owner})`);
      throw new ZoneViolationError(vaultRelativePath, this.agentMode, owner);
    }
  }

  getOwner(vaultRelativePath: string): AgentMode | 'shared' {
    // Normalize: ensure leading slash for folder comparison
    const normalized = vaultRelativePath.startsWith('/')
      ? vaultRelativePath
      : `/${vaultRelativePath}`;

    // Check local exclusive files (root-level files like Dashboard.md)
    const basename = path.basename(vaultRelativePath);
    if (this.ownership.localExclusive.includes(basename)) {
      return 'local';
    }

    // Check cloud-owned folders
    for (const folder of this.ownership.cloud) {
      if (normalized.startsWith(folder + '/') || normalized === folder) {
        return 'cloud';
      }
    }

    // Check local-owned folders
    for (const folder of this.ownership.local) {
      if (normalized.startsWith(folder + '/') || normalized === folder) {
        return 'local';
      }
    }

    // Check shared-read folders
    for (const folder of this.ownership.sharedRead) {
      if (normalized.startsWith(folder + '/') || normalized === folder) {
        return 'shared';
      }
    }

    // Unclassified files default to local ownership
    return 'local';
  }
}
