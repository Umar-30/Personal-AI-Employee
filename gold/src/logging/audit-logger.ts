import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type ApprovalStatus = 'approved' | 'rejected' | 'not_required';

export interface AuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  parameters: Record<string, unknown>;
  approvalStatus: ApprovalStatus;
  result: {
    success: boolean;
    detail: string;
    duration_ms: number;
  };
  financial: {
    odooRecordId: number;
    amount: number;
    currency: string;
    approvalChainRef: string;
  } | null;
  previousHash: string;
  entryHash: string;
}

export class AuditLogger {
  private logsDir: string;
  private enableHashChaining: boolean;
  private lastHash: string = 'GENESIS';
  private currentDate: string = '';

  constructor(logsDir: string, enableHashChaining = true) {
    this.logsDir = logsDir;
    this.enableHashChaining = enableHashChaining;

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Load last hash from today's log if it exists
    this.loadLastHash();
  }

  log(entry: Omit<AuditEntry, 'timestamp' | 'previousHash' | 'entryHash'>): void {
    const today = new Date().toISOString().split('T')[0];

    // Daily rotation — finalize previous day if needed
    if (this.currentDate && this.currentDate !== today) {
      this.finalizePreviousDay(this.currentDate);
      this.lastHash = 'GENESIS'; // Reset hash chain for new day
    }
    this.currentDate = today;

    const timestamp = new Date().toISOString();
    const previousHash = this.enableHashChaining ? this.lastHash : '';

    // Build entry without hash first
    const partialEntry = {
      ...entry,
      timestamp,
      previousHash,
      entryHash: '', // placeholder
    };

    // Compute hash
    const entryHash = this.enableHashChaining
      ? this.computeHash(JSON.stringify(partialEntry) + previousHash)
      : '';

    const fullEntry: AuditEntry = {
      ...partialEntry,
      entryHash,
    };

    // Append to daily file
    const logFile = path.join(this.logsDir, `${today}.json`);
    fs.appendFileSync(logFile, JSON.stringify(fullEntry) + '\n', 'utf-8');

    this.lastHash = entryHash || this.lastHash;
  }

  logFinancial(
    actor: string,
    action: string,
    params: Record<string, unknown>,
    approvalStatus: ApprovalStatus,
    result: AuditEntry['result'],
    financial: NonNullable<AuditEntry['financial']>,
  ): void {
    this.log({
      actor,
      action,
      parameters: params,
      approvalStatus,
      result,
      financial,
    });
  }

  getTodayEntries(): AuditEntry[] {
    const today = new Date().toISOString().split('T')[0];
    return this.getEntriesForDate(today);
  }

  getEntriesForDate(date: string): AuditEntry[] {
    const logFile = path.join(this.logsDir, `${date}.json`);
    if (!fs.existsSync(logFile)) return [];

    try {
      const content = fs.readFileSync(logFile, 'utf-8').trim();
      if (!content) return [];

      return content.split('\n').filter(Boolean).map(line => JSON.parse(line) as AuditEntry);
    } catch {
      return [];
    }
  }

  verifyIntegrity(date: string): { valid: boolean; brokenAt: number | null } {
    const entries = this.getEntriesForDate(date);
    if (entries.length === 0) return { valid: true, brokenAt: null };

    let expectedPrevHash = 'GENESIS';

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Verify previousHash chain
      if (entry.previousHash !== expectedPrevHash) {
        return { valid: false, brokenAt: i };
      }

      // Verify entry hash
      const partialEntry = { ...entry, entryHash: '' };
      const expectedHash = this.computeHash(JSON.stringify(partialEntry) + entry.previousHash);
      if (entry.entryHash !== expectedHash) {
        return { valid: false, brokenAt: i };
      }

      expectedPrevHash = entry.entryHash;
    }

    return { valid: true, brokenAt: null };
  }

  private computeHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private loadLastHash(): void {
    const today = new Date().toISOString().split('T')[0];
    this.currentDate = today;

    const logFile = path.join(this.logsDir, `${today}.json`);
    if (!fs.existsSync(logFile)) return;

    try {
      const content = fs.readFileSync(logFile, 'utf-8').trim();
      if (!content) return;

      const lines = content.split('\n').filter(Boolean);
      if (lines.length === 0) return;

      const lastEntry = JSON.parse(lines[lines.length - 1]) as AuditEntry;
      this.lastHash = lastEntry.entryHash || 'GENESIS';
    } catch {
      // If we can't read, start fresh
    }
  }

  private finalizePreviousDay(date: string): void {
    // Write a closing entry to the previous day's log
    const logFile = path.join(this.logsDir, `${date}.json`);
    if (!fs.existsSync(logFile)) return;

    const closingEntry = {
      timestamp: new Date().toISOString(),
      actor: 'audit-logger',
      action: 'day_finalized',
      parameters: { date },
      approvalStatus: 'not_required' as ApprovalStatus,
      result: { success: true, detail: `Log for ${date} finalized`, duration_ms: 0 },
      financial: null,
      previousHash: this.lastHash,
      entryHash: '',
    };

    closingEntry.entryHash = this.enableHashChaining
      ? this.computeHash(JSON.stringify(closingEntry) + this.lastHash)
      : '';

    fs.appendFileSync(logFile, JSON.stringify(closingEntry) + '\n', 'utf-8');
  }
}
