import { createApprovalRequest } from '../models/approval-request';
import { Logger } from '../logging/logger';

export class ApprovalGate {
  private logger: Logger;
  private pendingDir: string;

  constructor(pendingDir: string, logger: Logger) {
    this.pendingDir = pendingDir;
    this.logger = logger;
  }

  requestApproval(
    taskRef: string,
    planRef: string,
    stepNumber: number,
    action: string,
    riskLevel: string,
    impact: string,
  ): string {
    const request = createApprovalRequest(
      taskRef,
      planRef,
      stepNumber,
      action,
      riskLevel,
      impact,
      this.pendingDir,
    );

    this.logger.info(
      'approval_gate',
      `Approval requested: ${request.filename} — ${action}`,
      taskRef,
    );

    return request.filename;
  }
}
