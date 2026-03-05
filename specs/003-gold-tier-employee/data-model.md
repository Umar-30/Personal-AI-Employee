# Data Model: Gold Tier Autonomous Business Employee

**Feature**: 003-gold-tier-employee
**Date**: 2026-02-16

## Entity 1: Odoo Invoice

Represents a financial invoice created/read via the Odoo MCP server.

| Field | Type | Description |
|-------|------|-------------|
| odooId | number | Odoo record ID (assigned by Odoo on creation) |
| invoiceNumber | string | Sequential invoice reference (e.g., INV/2026/0001) |
| customer | string | Customer name |
| customerOdooId | number | Customer's Odoo partner ID |
| lineItems | InvoiceLineItem[] | Array of invoice line items |
| subtotal | number | Sum of line item amounts before tax |
| taxAmount | number | Total tax amount |
| total | number | Grand total (subtotal + tax) |
| currency | string | ISO 4217 currency code (e.g., USD, EUR) |
| status | 'draft' \| 'posted' \| 'paid' \| 'cancelled' | Invoice lifecycle status |
| dateInvoice | string | Invoice date (ISO 8601) |
| dateDue | string | Payment due date (ISO 8601) |
| approvalStatus | 'pending' \| 'approved' \| 'rejected' | HITL approval state |
| approvalFile | string \| null | Path to approval file in vault |

### InvoiceLineItem

| Field | Type | Description |
|-------|------|-------------|
| description | string | Line item description |
| quantity | number | Quantity |
| unitPrice | number | Price per unit |
| taxRate | number | Tax percentage (e.g., 0.10 for 10%) |
| amount | number | Line total (quantity * unitPrice) |

### State Transitions

```
draft → [approval requested] → [approved] → posted → paid
draft → [approval requested] → [rejected] → (archived)
draft → [error] → (alert created, human review)
```

---

## Entity 2: Odoo Accounting Entry

Represents a journal entry drafted via the Odoo MCP server.

| Field | Type | Description |
|-------|------|-------------|
| odooId | number | Odoo record ID |
| journal | string | Journal name (e.g., "Sales", "Bank") |
| reference | string | Entry reference |
| date | string | Entry date (ISO 8601) |
| lines | JournalLine[] | Debit/credit lines |
| status | 'draft' \| 'posted' | Entry status |
| approvalStatus | 'pending' \| 'approved' \| 'rejected' | HITL approval state |

### JournalLine

| Field | Type | Description |
|-------|------|-------------|
| account | string | Account code/name |
| debit | number | Debit amount (0 if credit) |
| credit | number | Credit amount (0 if debit) |
| label | string | Line description |

---

## Entity 3: Social Media Post

Represents a content artifact targeted at one or more platforms.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Internal post ID (UUID) |
| platforms | SocialPlatform[] | Target platforms |
| drafts | PlatformDraft[] | Platform-specific content drafts |
| mediaAttachments | string[] | Paths to media files (if any) |
| status | 'drafting' \| 'pending_approval' \| 'approved' \| 'published' \| 'rejected' \| 'failed' | Post lifecycle |
| createdAt | string | Creation timestamp (ISO 8601) |
| publishedAt | string \| null | Publication timestamp |

### SocialPlatform

```typescript
type SocialPlatform = 'facebook' | 'instagram' | 'twitter' | 'linkedin';
```

### PlatformDraft

| Field | Type | Description |
|-------|------|-------------|
| platform | SocialPlatform | Target platform |
| text | string | Platform-formatted post text |
| characterCount | number | Current character count |
| characterLimit | number | Platform's character limit |
| approvalStatus | 'pending' \| 'approved' \| 'rejected' | Per-platform approval |
| approvalFile | string \| null | Approval file path |
| publishResult | PublishResult \| null | Result after publish attempt |

### PublishResult

| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Whether publish succeeded |
| postId | string \| null | Platform's post ID |
| postUrl | string \| null | URL of published post |
| error | string \| null | Error message if failed |

### Platform Character Limits

| Platform | Limit |
|----------|-------|
| Twitter/X | 280 |
| Instagram | 2,200 |
| LinkedIn | 3,000 |
| Facebook | 63,206 |

---

## Entity 4: CEO Briefing

Weekly executive report synthesizing financial, operational, and strategic data.

| Field | Type | Description |
|-------|------|-------------|
| reportDate | string | Briefing date (ISO 8601) |
| weekStart | string | Start of reporting week |
| weekEnd | string | End of reporting week |
| revenueSummary | RevenueSummary | Financial overview |
| bottlenecks | Bottleneck[] | Identified operational bottlenecks |
| subscriptionAudit | SubscriptionItem[] | Recurring cost analysis |
| risks | Risk[] | Business risk assessment |
| recommendations | string[] | Proactive recommendations (min 3) |
| dataSources | DataSourceStatus[] | Status of each data source used |

### RevenueSummary

| Field | Type | Description |
|-------|------|-------------|
| totalIncome | number | Week's total income |
| totalExpenses | number | Week's total expenses |
| netRevenue | number | Income minus expenses |
| currency | string | Primary currency |
| invoicesPaid | number | Count of invoices paid this week |
| invoicesOutstanding | number | Count of unpaid invoices |
| outstandingAmount | number | Total amount of unpaid invoices |

### Bottleneck

| Field | Type | Description |
|-------|------|-------------|
| area | string | Business area affected |
| description | string | What's blocked/slow |
| severity | 'low' \| 'medium' \| 'high' | Impact level |
| suggestedAction | string | Recommended resolution |

### Risk

| Field | Type | Description |
|-------|------|-------------|
| category | string | Risk category |
| description | string | Risk description |
| likelihood | 'low' \| 'medium' \| 'high' | Probability |
| impact | 'low' \| 'medium' \| 'high' | Business impact |
| mitigation | string | Suggested mitigation |

---

## Entity 5: Watchdog State

Supervisor process state for daemon health monitoring.

| Field | Type | Description |
|-------|------|-------------|
| pidFilePath | string | Path to daemon's PID file |
| checkIntervalMs | number | Health check interval (default: 30000) |
| maxRestarts | number | Max consecutive restarts before alerting |
| restartCount | number | Current consecutive restart count |
| lastCheckTimestamp | string | Last health check time (ISO 8601) |
| lastRestartTimestamp | string \| null | Last daemon restart time |
| daemonStatus | 'running' \| 'stopped' \| 'restarting' \| 'failed' | Current daemon state |

---

## Entity 6: Audit Log Entry

Structured record of every system action for compliance.

| Field | Type | Description |
|-------|------|-------------|
| timestamp | string | ISO 8601 timestamp |
| actor | string | System component or user (e.g., "gold-daemon", "odoo-skill", "user:approval") |
| action | string | Action type (e.g., "invoice_created", "post_published", "approval_granted") |
| parameters | Record<string, unknown> | Input parameters summary |
| approvalStatus | 'approved' \| 'rejected' \| 'not_required' | Whether action needed approval |
| result | AuditResult | Action outcome |
| financial | FinancialMetadata \| null | Present only for financial actions |
| previousHash | string | SHA-256 hash of previous log entry (chain integrity) |
| entryHash | string | SHA-256 hash of this entry (for tamper detection) |

### AuditResult

| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Whether action succeeded |
| detail | string | Success message or error details |
| duration_ms | number | Action execution time |

### FinancialMetadata

| Field | Type | Description |
|-------|------|-------------|
| odooRecordId | number | Odoo record ID |
| amount | number | Financial amount |
| currency | string | ISO 4217 currency code |
| approvalChainRef | string | Reference to approval file path |

---

## Entity 7: Persistence Loop State

Tracks the state of the Ralph Wiggum persistence loop for a task.

| Field | Type | Description |
|-------|------|-------------|
| taskRef | string | Reference to the task file |
| planRef | string | Reference to the plan file |
| totalSteps | number | Total plan steps |
| completedSteps | number | Steps marked complete |
| failedSteps | number | Steps that failed (after retries) |
| currentIteration | number | Loop iteration count |
| lastProgressTimestamp | string | Last time a step completed |
| stallTimeoutMs | number | Time without progress before alert (configurable) |
| isStalled | boolean | Whether stall has been detected |
| completionConditions | CompletionCondition[] | What must be true for completion |

### CompletionCondition

| Field | Type | Description |
|-------|------|-------------|
| type | 'plan_complete' \| 'file_moved' \| 'promise_emitted' | Condition type |
| satisfied | boolean | Whether condition is met |
| detail | string | Condition-specific detail |
