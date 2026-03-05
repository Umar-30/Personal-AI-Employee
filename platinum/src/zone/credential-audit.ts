import { PlatinumConfig, AgentMode } from '../config/platinum-config';
import { Logger } from '../../../bronze/src/logging/logger';

// Sensitive env vars that MUST NOT exist on cloud
const SENSITIVE_ENV_PATTERNS = [
  // Banking
  'BANK_',
  'BANKING_',
  'PAYMENT_',
  'STRIPE_',
  'PAYPAL_',
  // WhatsApp
  'WHATSAPP_',
  'WA_SESSION',
  'WA_TOKEN',
];

// Specific sensitive env vars to check
const SENSITIVE_ENV_VARS = [
  'BANK_API_KEY',
  'BANK_ACCESS_TOKEN',
  'WHATSAPP_SESSION_TOKEN',
  'WHATSAPP_API_KEY',
  'PAYMENT_SECRET_KEY',
  'PAYMENT_API_KEY',
  'STRIPE_SECRET_KEY',
];

export interface CredentialAuditResult {
  clean: boolean;
  violations: string[];
  checkedVars: number;
  agentMode: AgentMode;
}

export function auditCloudCredentials(config: PlatinumConfig): CredentialAuditResult {
  if (config.agentMode !== 'cloud') {
    return {
      clean: true,
      violations: [],
      checkedVars: 0,
      agentMode: config.agentMode,
    };
  }

  const violations: string[] = [];
  let checkedVars = 0;

  // Check specific sensitive vars
  for (const varName of SENSITIVE_ENV_VARS) {
    checkedVars++;
    if (process.env[varName]) {
      violations.push(`Sensitive credential found: ${varName}`);
    }
  }

  // Check pattern-based sensitive vars
  for (const key of Object.keys(process.env)) {
    for (const pattern of SENSITIVE_ENV_PATTERNS) {
      if (key.startsWith(pattern)) {
        checkedVars++;
        violations.push(`Sensitive credential pattern found: ${key} (matches ${pattern}*)`);
      }
    }
  }

  return {
    clean: violations.length === 0,
    violations,
    checkedVars,
    agentMode: 'cloud',
  };
}
