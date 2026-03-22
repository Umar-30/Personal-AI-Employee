#!/usr/bin/env node
/**
 * Gmail MCP Stdio Wrapper
 * Reads OAuth2 credentials from GMAIL_CREDENTIALS_PATH + GMAIL_TOKEN_PATH
 * and exposes Gmail tools over the MCP stdio protocol (CommonJS).
 *
 * Supported tools: list_emails, read_email, send_email, search_emails
 */

'use strict';

const { Server } = require('./node_modules/@modelcontextprotocol/sdk/dist/cjs/server/index.js');
const { StdioServerTransport } = require('./node_modules/@modelcontextprotocol/sdk/dist/cjs/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('./node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = process.env.GMAIL_CREDENTIALS_PATH || path.resolve('./credentials.json');
const TOKEN_PATH = process.env.GMAIL_TOKEN_PATH || path.resolve('./token.json');

// ─── Auth ────────────────────────────────────────────────────────────────────

function loadOAuth2Client() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
  client.setCredentials(token);

  // Auto-save refreshed tokens
  client.on('tokens', (newTokens) => {
    try {
      const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      const merged = {
        ...existing,
        ...newTokens,
        refresh_token: newTokens.refresh_token || existing.refresh_token,
      };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    } catch { /* ignore save errors */ }
  });

  return client;
}

// ─── Gmail helpers ────────────────────────────────────────────────────────────

function decodeBase64(data) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.body && payload.body.data) return decodeBase64(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return decodeBase64(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  return '';
}

function headerVal(headers, name) {
  const h = (headers || []).find(h => h.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_emails',
    description: 'List recent emails from Gmail inbox',
    inputSchema: {
      type: 'object',
      properties: {
        maxResults: { type: 'number', description: 'Max emails to return (default 10)' },
        query: { type: 'string', description: 'Gmail search query (optional)' },
      },
    },
  },
  {
    name: 'read_email',
    description: 'Read the full content of an email by message ID',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Gmail message ID' },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'send_email',
    description: 'Send an email via Gmail',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Plain text email body' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'search_emails',
    description: 'Search Gmail using a query string',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query (e.g. "from:boss@company.com is:unread")' },
        maxResults: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const auth = loadOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth });

  const server = new Server(
    { name: 'gmail-stdio', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'list_emails': {
          const res = await gmail.users.messages.list({
            userId: 'me',
            maxResults: (args && args.maxResults) || 10,
            q: (args && args.query) || 'in:inbox',
          });

          const messages = res.data.messages || [];
          if (messages.length === 0) return { content: [{ type: 'text', text: 'No emails found.' }] };

          const details = await Promise.all(
            messages.slice(0, 10).map(m =>
              gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata',
                metadataHeaders: ['From', 'Subject', 'Date'] })
            )
          );

          const summary = details.map(d => {
            const h = d.data.payload && d.data.payload.headers || [];
            return `ID: ${d.data.id}\nFrom: ${headerVal(h,'From')}\nSubject: ${headerVal(h,'Subject')}\nDate: ${headerVal(h,'Date')}`;
          }).join('\n\n');

          return { content: [{ type: 'text', text: summary }] };
        }

        case 'read_email': {
          const res = await gmail.users.messages.get({
            userId: 'me', id: args.messageId, format: 'full',
          });
          const h = (res.data.payload && res.data.payload.headers) || [];
          const body = extractBody(res.data.payload);
          const text = `From: ${headerVal(h,'From')}\nTo: ${headerVal(h,'To')}\nSubject: ${headerVal(h,'Subject')}\nDate: ${headerVal(h,'Date')}\n\n${body}`;
          return { content: [{ type: 'text', text }] };
        }

        case 'send_email': {
          const raw = Buffer.from(
            `To: ${args.to}\r\nSubject: ${args.subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${args.body}`
          ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

          const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
          return { content: [{ type: 'text', text: `Email sent. Message ID: ${res.data.id}` }] };
        }

        case 'search_emails': {
          const res = await gmail.users.messages.list({
            userId: 'me',
            maxResults: (args && args.maxResults) || 10,
            q: args.query,
          });

          const messages = res.data.messages || [];
          if (messages.length === 0) return { content: [{ type: 'text', text: 'No results.' }] };

          const details = await Promise.all(
            messages.slice(0, 10).map(m =>
              gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata',
                metadataHeaders: ['From', 'Subject', 'Date'] })
            )
          );

          const summary = details.map(d => {
            const h = (d.data.payload && d.data.payload.headers) || [];
            return `ID: ${d.data.id}\nFrom: ${headerVal(h,'From')}\nSubject: ${headerVal(h,'Subject')}\nDate: ${headerVal(h,'Date')}`;
          }).join('\n\n');

          return { content: [{ type: 'text', text: summary }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('Gmail MCP stdio server ready (token-file auth)\n');
}

main().catch(err => {
  process.stderr.write(`Gmail MCP fatal: ${err.message}\n`);
  process.exit(1);
});
