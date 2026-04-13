import {
  BaseSkill,
  SkillResult,
  ExecutionContext,
  makeApprovalResult,
  makeSuccessResult,
  makeErrorResult,
} from '../../../bronze/src/skills/base-skill';
import { TaskFile } from '../../../bronze/src/models/task-file';
import { MCPManager } from '../mcp/mcp-manager';
import matter from 'gray-matter';

/**
 * WebTaskSkill — Playwright MCP powered browser automation skill.
 *
 * Supported actions (set via task frontmatter `action` field):
 *   screenshot  — Navigate to URL and capture a screenshot (default)
 *   scrape      — Navigate and extract all visible text content
 *   fill-form   — Navigate, fill form fields, and submit
 *   research    — Scrape multiple URLs and synthesise a summary via Claude
 *
 * Task file frontmatter fields:
 *   type:    web_task          (required — triggers this skill)
 *   url:     https://...       (required for screenshot/scrape/fill-form)
 *   urls:    url1,url2,...     (required for research action)
 *   action:  screenshot | scrape | fill-form | research   (default: screenshot)
 *   fields:  JSON string of { selector: value } pairs     (fill-form only)
 *   submit:  CSS selector of the submit button            (fill-form only)
 */
/** Extract full raw frontmatter (including custom fields) from task.raw */
function rawFrontmatter(task: TaskFile): Record<string, unknown> {
  try {
    return matter(task.raw).data as Record<string, unknown>;
  } catch {
    return {};
  }
}

export class WebTaskSkill implements BaseSkill {
  name = 'web-task';

  constructor(private mcpManager: MCPManager) {}

  canHandle(task: TaskFile): boolean {
    const body = task.body.toLowerCase();
    const fm = rawFrontmatter(task);
    const type = (fm.type as string | undefined) ?? '';
    return (
      type === 'web_task' ||
      body.includes('open website') ||
      body.includes('scrape') ||
      body.includes('fill form') ||
      body.includes('take screenshot') ||
      body.includes('web research') ||
      body.includes('browse ') ||
      body.includes('visit website') ||
      body.includes('competitor price') ||
      body.includes('check website')
    );
  }

  async execute(task: TaskFile, context: ExecutionContext): Promise<SkillResult> {
    const { logger } = context;

    if (!this.mcpManager.isConnected('playwright')) {
      return makeErrorResult(
        'Playwright MCP not connected. Ensure @playwright/mcp is installed and PLAYWRIGHT_ENABLED=true is set.'
      );
    }

    const fm = rawFrontmatter(task);
    const action = (fm.action as string | undefined) ?? 'screenshot';
    const url = fm.url as string | undefined;

    logger.info('web_task', `Starting web task: action=${action}`, task.filename);

    switch (action) {
      case 'screenshot':
        return this.doScreenshot(url, task, context);
      case 'scrape':
        return this.doScrape(url, task, context);
      case 'fill-form':
        return this.doFillForm(url, task, context);
      case 'research':
        return this.doResearch(task, context);
      default:
        return makeErrorResult(`Unknown web_task action: "${action}". Use screenshot | scrape | fill-form | research`);
    }
  }

  // ── Screenshot ────────────────────────────────────────────────────────────

  private async doScreenshot(
    url: string | undefined,
    task: TaskFile,
    context: ExecutionContext,
  ): Promise<SkillResult> {
    const { logger } = context;

    if (!url) return makeErrorResult('web_task action=screenshot requires a `url` in frontmatter.');

    const navResult = await this.mcpManager.callTool('playwright', 'browser_navigate', { url });
    if (!navResult.success) return makeErrorResult(`Navigation failed: ${navResult.error}`);

    const shotResult = await this.mcpManager.callTool('playwright', 'browser_take_screenshot', {});
    if (!shotResult.success) return makeErrorResult(`Screenshot failed: ${shotResult.error}`);

    logger.info('web_task', `Screenshot captured from ${url}`, task.filename);

    return makeApprovalResult(
      `Screenshot captured from: ${url}\n\nApprove to confirm the result was saved.`
    );
  }

  // ── Scrape ────────────────────────────────────────────────────────────────

  private async doScrape(
    url: string | undefined,
    task: TaskFile,
    context: ExecutionContext
  ): Promise<SkillResult> {
    const { logger } = context;

    if (!url) return makeErrorResult('web_task action=scrape requires a `url` in frontmatter.');

    const navResult = await this.mcpManager.callTool('playwright', 'browser_navigate', { url });
    if (!navResult.success) return makeErrorResult(`Navigation failed: ${navResult.error}`);

    const textResult = await this.mcpManager.callTool('playwright', 'browser_get_text', {});
    if (!textResult.success) return makeErrorResult(`Scrape failed: ${textResult.error}`);

    const content = String(textResult.response ?? '').trim();
    logger.info('web_task', `Scraped ${content.length} chars from ${url}`, task.filename);

    return makeSuccessResult(
      `Web content scraped from ${url}:\n\n${content.substring(0, 3000)}${content.length > 3000 ? '\n\n[...truncated]' : ''}`,
      [],
      []
    );
  }

  // ── Fill Form ─────────────────────────────────────────────────────────────

  private async doFillForm(
    url: string | undefined,
    task: TaskFile,
    context: ExecutionContext
  ): Promise<SkillResult> {
    const { logger } = context;

    if (!url) return makeErrorResult('web_task action=fill-form requires a `url` in frontmatter.');

    const fm = rawFrontmatter(task);
    const fieldsRaw = fm.fields as string | undefined;
    if (!fieldsRaw) return makeErrorResult('web_task action=fill-form requires a `fields` JSON string in frontmatter.');

    let fields: Record<string, string>;
    try {
      fields = JSON.parse(fieldsRaw);
    } catch {
      return makeErrorResult('`fields` frontmatter value is not valid JSON. Use: {"#selector": "value"}');
    }

    const submitSelector = fm.submit as string | undefined;

    // Navigate
    const navResult = await this.mcpManager.callTool('playwright', 'browser_navigate', { url });
    if (!navResult.success) return makeErrorResult(`Navigation to ${url} failed: ${navResult.error}`);

    // Fill each field
    for (const [selector, value] of Object.entries(fields)) {
      const fillResult = await this.mcpManager.callTool('playwright', 'browser_fill', {
        selector,
        value,
      });
      if (!fillResult.success) {
        logger.warn('web_task', `Fill failed for selector "${selector}": ${fillResult.error}`, task.filename);
      }
    }

    logger.info('web_task', `Form fields filled on ${url}`, task.filename);

    // Always require approval before submitting
    const fieldSummary = Object.entries(fields)
      .map(([sel, val]) => `  ${sel}: ${val}`)
      .join('\n');

    return makeApprovalResult(
      `Form ready to submit on: ${url}\n\nFields filled:\n${fieldSummary}\n\nSubmit button: ${submitSelector ?? '(none — manual submit)'}\n\nApprove to submit the form.`
    );
  }

  // ── Research (multi-URL scrape + Claude synthesis) ────────────────────────

  private async doResearch(task: TaskFile, context: ExecutionContext): Promise<SkillResult> {
    const { logger, claudeClient } = context;

    const fm = rawFrontmatter(task);
    const urlsRaw = fm.urls as string | undefined;
    if (!urlsRaw) return makeErrorResult('web_task action=research requires a `urls` field (comma-separated) in frontmatter.');

    const urls = urlsRaw.split(',').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return makeErrorResult('No valid URLs found in `urls` frontmatter field.');

    const scrapedParts: string[] = [];

    for (const url of urls) {
      logger.info('web_task', `Researching: ${url}`, task.filename);

      const navResult = await this.mcpManager.callTool('playwright', 'browser_navigate', { url });
      if (!navResult.success) {
        scrapedParts.push(`## ${url}\n[Navigation failed: ${navResult.error}]`);
        continue;
      }

      const textResult = await this.mcpManager.callTool('playwright', 'browser_get_text', {});
      if (!textResult.success) {
        scrapedParts.push(`## ${url}\n[Scrape failed: ${textResult.error}]`);
        continue;
      }

      const content = String(textResult.response ?? '').trim().substring(0, 2000);
      scrapedParts.push(`## ${url}\n${content}`);
    }

    const rawContent = scrapedParts.join('\n\n---\n\n');

    // Synthesise with Claude
    let businessContext = '';
    if (context.goals) businessContext += `\n## Business Goals\n${context.goals}`;
    if (context.handbook) businessContext += `\n## Brand Guidelines\n${context.handbook}`;

    const prompt = `You are a business intelligence analyst. Analyse the following web content scraped from ${urls.length} website(s) and produce a concise summary report.

## Research Task
${task.body}
${businessContext}

## Scraped Web Content
${rawContent}

## Instructions
- Extract key facts, prices, features, or insights relevant to the task
- Highlight competitor strengths and weaknesses if applicable
- Provide 3-5 actionable insights for the CEO
- Format as a brief report with clear sections
- Maximum 600 words`;

    const response = await claudeClient.prompt(prompt);
    if (!response.success) {
      return makeErrorResult(`Claude synthesis failed: ${response.error}`);
    }

    logger.info('web_task', `Research complete — ${urls.length} URLs analysed`, task.filename);

    return makeSuccessResult(
      `# Web Research Report\n\n**Sources:** ${urls.join(', ')}\n\n${response.text.trim()}`,
      [],
      []
    );
  }
}
