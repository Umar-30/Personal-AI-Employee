---
id: "001"
title: MCP Server Research Gmail LinkedIn SDK
stage: general
date: 2026-02-16
surface: agent
model: claude-sonnet-4-5-20250929
feature: none
branch: 002-silver-tier-assistant
user: unknown
command: research query
labels: ["research","mcp","gmail","linkedin","sdk","typescript"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - none
tests:
  - none
---

## Prompt

Research the following and return concise findings:

1. **Gmail MCP Server**: Find the most mature/popular MCP (Model Context Protocol) server for Gmail. Look for npm packages or GitHub repos. I need: package name, what tools it exposes (send, read, search, etc.), authentication method (OAuth2, API key, etc.), and how to install/configure it.

2. **LinkedIn MCP Server**: Find any MCP server for LinkedIn posting. If none exists, what's the best alternative approach? (e.g., LinkedIn API directly via a custom MCP wrapper, browser automation MCP, etc.)

3. **MCP SDK**: What npm package provides the MCP client/server SDK for TypeScript? How does a TypeScript app call an MCP server programmatically?

Return structured findings with package names, install commands, and key API details. Focus on what actually exists and works, not hypotheticals.

## Response snapshot

### Gmail MCP Server
- **Winner:** `@shinzolabs/gmail-mcp` (shinzo-labs/gmail-mcp)
- **60+ tools** including messages.send, messages.list, messages.get, messages.delete, messages.trash, messages.modify, drafts.create/send/delete, threads.list/get, labels.create/update/delete, users.getProfile
- **Auth:** OAuth 2.0 via Google Cloud Console — download credentials JSON to `~/.gmail-mcp/gcp-oauth.keys.json`, run `npx @shinzolabs/gmail-mcp auth`
- **Install:** `npm install @shinzolabs/gmail-mcp` or `npx @shinzolabs/gmail-mcp`
- **Alt:** `@gongrzhe/server-gmail-mcp` — also OAuth2, auto-auth support

### LinkedIn MCP Server
- No single dominant/official server exists
- **Best for posting:** `lurenss/linkedin-mcp` (GitHub only) — tools: create_text_post, create_image_post, get_profile; auth via pre-obtained OAuth2 access token; env vars: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_ACCESS_TOKEN
- **Broader option:** `linkedin-mcp-server` (felipfr) on npm — 7 tools, browser-flow OAuth2 with 60-day token refresh, LINKEDIN_CLIENT_ID + LINKEDIN_CLIENT_SECRET
- **Caveat:** LinkedIn API requires Developer Portal approval for posting (Share on LinkedIn / Community Management API)

### MCP TypeScript SDK
- **Package:** `@modelcontextprotocol/sdk` v1.26.0
- **Install:** `npm install @modelcontextprotocol/sdk` (peer dep: zod v3.25+)
- **Client usage:** Import `Client` from `@modelcontextprotocol/sdk/client/index.js`, connect via `StdioClientTransport` (local subprocess) or `SSEClientTransport` (remote HTTP)
- **Key methods:** `client.connect(transport)`, `client.listTools()`, `client.callTool({ name, arguments })`, `client.close()`

## Outcome

- Impact: Identified three concrete MCP integration points for the AI Employee project — Gmail, LinkedIn, and the TypeScript SDK needed to wire them together
- Tests: none — research task
- Files: none created or modified
- Next prompts: implement Gmail MCP integration, implement LinkedIn MCP integration, build MCP client wrapper in TypeScript
- Reflection: LinkedIn ecosystem is fragmented with no official MCP server; the lurenss/linkedin-mcp is the most focused on posting but requires a pre-obtained access token rather than a full OAuth flow

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): N/A
- Prompt variant (if applicable): N/A
- Next experiment: test @shinzolabs/gmail-mcp auth flow in dev environment
