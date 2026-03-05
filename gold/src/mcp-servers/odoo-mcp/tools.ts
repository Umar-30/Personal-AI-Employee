import { OdooClient } from './odoo-client';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export function createOdooTools(client: OdooClient): ToolDefinition[] {
  return [
    {
      name: 'create_invoice',
      description: 'Create a draft invoice in Odoo. Returns the draft invoice details. Does NOT post the invoice.',
      inputSchema: {
        type: 'object',
        properties: {
          customer: { type: 'string', description: 'Customer name' },
          lineItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                quantity: { type: 'number' },
                unitPrice: { type: 'number' },
                taxRate: { type: 'number', description: 'Tax rate as decimal (e.g., 0.10 for 10%)' },
              },
              required: ['description', 'quantity', 'unitPrice'],
            },
          },
          currency: { type: 'string', description: 'ISO 4217 currency code (default: USD)' },
          dateDue: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
        },
        required: ['customer', 'lineItems'],
      },
      handler: async (args) => {
        const customer = args.customer as string;
        const lineItems = args.lineItems as Array<{ description: string; quantity: number; unitPrice: number; taxRate?: number }>;
        const currency = (args.currency as string) || 'USD';
        const dateDue = args.dateDue as string | undefined;

        // Find or create customer partner
        const partners = await client.searchRead('res.partner', [['name', '=', customer]], ['id', 'name'], 1);
        let partnerId: number;
        if (partners.length > 0) {
          partnerId = (partners[0] as Record<string, unknown>).id as number;
        } else {
          partnerId = await client.create('res.partner', { name: customer });
        }

        // Find currency
        const currencies = await client.searchRead('res.currency', [['name', '=', currency]], ['id'], 1);
        const currencyId = currencies.length > 0 ? (currencies[0] as Record<string, unknown>).id as number : undefined;

        // Build invoice lines
        const invoiceLines = lineItems.map((item) => [
          0, 0, {
            name: item.description,
            quantity: item.quantity,
            price_unit: item.unitPrice,
          },
        ]);

        // Create draft invoice
        const invoiceValues: Record<string, unknown> = {
          move_type: 'out_invoice',
          partner_id: partnerId,
          invoice_line_ids: invoiceLines,
        };
        if (currencyId) invoiceValues.currency_id = currencyId;
        if (dateDue) invoiceValues.invoice_date_due = dateDue;

        const invoiceId = await client.create('account.move', invoiceValues);

        // Read back the created invoice
        const invoices = await client.read('account.move', [invoiceId], ['name', 'amount_total', 'state']);
        const invoice = invoices[0] as Record<string, unknown>;

        return {
          odooId: invoiceId,
          invoiceNumber: invoice.name || `DRAFT-${invoiceId}`,
          status: 'draft',
          total: invoice.amount_total || 0,
        };
      },
    },
    {
      name: 'post_invoice',
      description: 'Post (confirm) a draft invoice in Odoo. This is a financial write action.',
      inputSchema: {
        type: 'object',
        properties: {
          odooId: { type: 'number', description: 'Odoo invoice record ID' },
        },
        required: ['odooId'],
      },
      handler: async (args) => {
        const odooId = args.odooId as number;

        await client.callMethod('account.move', 'action_post', [odooId]);

        const invoices = await client.read('account.move', [odooId], ['name', 'state']);
        const invoice = invoices[0] as Record<string, unknown>;

        return {
          odooId,
          status: invoice.state === 'posted' ? 'posted' : invoice.state,
          invoiceNumber: invoice.name,
        };
      },
    },
    {
      name: 'list_invoices',
      description: 'List invoices from Odoo with optional filters.',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by state: draft, posted, cancel' },
          customer: { type: 'string', description: 'Filter by customer name' },
          limit: { type: 'number', description: 'Max results (default: 50)' },
        },
      },
      handler: async (args) => {
        const domain: unknown[] = [['move_type', '=', 'out_invoice']];
        if (args.status) domain.push(['state', '=', args.status]);
        if (args.customer) domain.push(['partner_id.name', 'ilike', args.customer]);
        const limit = (args.limit as number) || 50;

        const invoices = await client.searchRead(
          'account.move',
          domain,
          ['id', 'name', 'partner_id', 'amount_total', 'state', 'invoice_date_due'],
          limit,
        );

        return invoices.map((inv: unknown) => {
          const i = inv as Record<string, unknown>;
          const partner = i.partner_id as [number, string] | false;
          return {
            odooId: i.id,
            invoiceNumber: i.name,
            customer: partner ? partner[1] : 'Unknown',
            total: i.amount_total,
            status: i.state,
            dateDue: i.invoice_date_due || null,
          };
        });
      },
    },
    {
      name: 'get_invoice',
      description: 'Get detailed information about a single invoice including line items.',
      inputSchema: {
        type: 'object',
        properties: {
          odooId: { type: 'number', description: 'Odoo invoice record ID' },
        },
        required: ['odooId'],
      },
      handler: async (args) => {
        const odooId = args.odooId as number;

        const invoices = await client.read('account.move', [odooId], [
          'name', 'partner_id', 'amount_untaxed', 'amount_tax', 'amount_total',
          'currency_id', 'state', 'invoice_date', 'invoice_date_due', 'invoice_line_ids',
        ]);
        const inv = invoices[0] as Record<string, unknown>;
        const partner = inv.partner_id as [number, string] | false;
        const currency = inv.currency_id as [number, string] | false;

        // Read line items
        const lineIds = inv.invoice_line_ids as number[];
        let lineItems: unknown[] = [];
        if (lineIds && lineIds.length > 0) {
          lineItems = await client.read('account.move.line', lineIds, ['name', 'quantity', 'price_unit', 'price_subtotal']);
        }

        return {
          odooId,
          invoiceNumber: inv.name,
          customer: partner ? partner[1] : 'Unknown',
          lineItems: lineItems.map((l: unknown) => {
            const line = l as Record<string, unknown>;
            return {
              description: line.name,
              quantity: line.quantity,
              unitPrice: line.price_unit,
              amount: line.price_subtotal,
            };
          }),
          subtotal: inv.amount_untaxed,
          taxAmount: inv.amount_tax,
          total: inv.amount_total,
          currency: currency ? currency[1] : 'USD',
          status: inv.state,
          dateInvoice: inv.invoice_date,
          dateDue: inv.invoice_date_due,
        };
      },
    },
    {
      name: 'create_journal_entry',
      description: 'Create a draft journal entry in Odoo. Does NOT post automatically.',
      inputSchema: {
        type: 'object',
        properties: {
          journal: { type: 'string', description: 'Journal name (e.g., "Sales", "Bank")' },
          date: { type: 'string', description: 'Entry date in YYYY-MM-DD format' },
          reference: { type: 'string', description: 'Entry reference' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                account: { type: 'string', description: 'Account code or name' },
                debit: { type: 'number' },
                credit: { type: 'number' },
                label: { type: 'string' },
              },
              required: ['account', 'debit', 'credit', 'label'],
            },
          },
        },
        required: ['journal', 'date', 'reference', 'lines'],
      },
      handler: async (args) => {
        const journalName = args.journal as string;
        const lines = args.lines as Array<{ account: string; debit: number; credit: number; label: string }>;

        // Find journal
        const journals = await client.searchRead('account.journal', [['name', 'ilike', journalName]], ['id'], 1);
        if (journals.length === 0) throw new Error(`Journal not found: ${journalName}`);
        const journalId = (journals[0] as Record<string, unknown>).id as number;

        // Build journal lines
        const journalLines = [];
        for (const line of lines) {
          const accounts = await client.searchRead('account.account', [['name', 'ilike', line.account]], ['id'], 1);
          if (accounts.length === 0) throw new Error(`Account not found: ${line.account}`);
          const accountId = (accounts[0] as Record<string, unknown>).id as number;

          journalLines.push([0, 0, {
            account_id: accountId,
            debit: line.debit,
            credit: line.credit,
            name: line.label,
          }]);
        }

        const entryId = await client.create('account.move', {
          journal_id: journalId,
          date: args.date,
          ref: args.reference,
          move_type: 'entry',
          line_ids: journalLines,
        });

        return {
          odooId: entryId,
          reference: args.reference,
          status: 'draft',
        };
      },
    },
    {
      name: 'list_journal_entries',
      description: 'List journal entries from Odoo with optional filters.',
      inputSchema: {
        type: 'object',
        properties: {
          journal: { type: 'string', description: 'Filter by journal name' },
          dateFrom: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
          dateTo: { type: 'string', description: 'End date (YYYY-MM-DD)' },
          limit: { type: 'number', description: 'Max results (default: 50)' },
        },
      },
      handler: async (args) => {
        const domain: unknown[] = [['move_type', '=', 'entry']];
        if (args.journal) {
          const journals = await client.searchRead('account.journal', [['name', 'ilike', args.journal]], ['id'], 1);
          if (journals.length > 0) {
            domain.push(['journal_id', '=', (journals[0] as Record<string, unknown>).id]);
          }
        }
        if (args.dateFrom) domain.push(['date', '>=', args.dateFrom]);
        if (args.dateTo) domain.push(['date', '<=', args.dateTo]);
        const limit = (args.limit as number) || 50;

        const entries = await client.searchRead(
          'account.move',
          domain,
          ['id', 'journal_id', 'ref', 'date', 'state'],
          limit,
        );

        return entries.map((e: unknown) => {
          const entry = e as Record<string, unknown>;
          const journal = entry.journal_id as [number, string] | false;
          return {
            odooId: entry.id,
            journal: journal ? journal[1] : 'Unknown',
            reference: entry.ref || '',
            date: entry.date,
            status: entry.state,
          };
        });
      },
    },
  ];
}
