import { BaseSkill, SkillResult, ExecutionContext, makeApprovalResult, makeSuccessResult, makeErrorResult } from '../../../bronze/src/skills/base-skill';
import { TaskFile } from '../../../bronze/src/models/task-file';
import { SocialMediaManager, SocialPlatform } from '../social/social-media-manager';

const PLATFORM_LIMITS: Record<SocialPlatform, number> = {
  twitter: 280,
  instagram: 2200,
  linkedin: 3000,
  facebook: 63206,
};

export class SocialPostSkill implements BaseSkill {
  name = 'social-post';
  private socialMediaManager: SocialMediaManager;

  constructor(socialMediaManager: SocialMediaManager) {
    this.socialMediaManager = socialMediaManager;
  }

  canHandle(task: TaskFile): boolean {
    const body = task.body.toLowerCase();
    const type = task.frontmatter.type as string;
    return (
      type === 'social_post' ||
      body.includes('social media') ||
      body.includes('post across') ||
      body.includes('post on facebook') ||
      body.includes('post on instagram') ||
      body.includes('post on twitter') ||
      body.includes('all social platforms') ||
      body.includes('all platforms')
    );
  }

  async execute(task: TaskFile, context: ExecutionContext): Promise<SkillResult> {
    const { logger, claudeClient } = context;

    const configuredPlatforms = this.socialMediaManager.getConfiguredPlatforms();
    if (configuredPlatforms.length === 0) {
      return makeErrorResult('No social media platforms configured.');
    }

    // Determine target platforms from task body
    const body = task.body.toLowerCase();
    let targetPlatforms: SocialPlatform[] = [];

    if (body.includes('all platform') || body.includes('all social') || body.includes('every platform')) {
      targetPlatforms = configuredPlatforms;
    } else {
      if (body.includes('facebook')) targetPlatforms.push('facebook');
      if (body.includes('instagram')) targetPlatforms.push('instagram');
      if (body.includes('twitter') || body.includes('x.com')) targetPlatforms.push('twitter');
      if (body.includes('linkedin')) targetPlatforms.push('linkedin');
      if (targetPlatforms.length === 0) targetPlatforms = configuredPlatforms;
    }

    // Filter to only configured platforms
    targetPlatforms = targetPlatforms.filter(p => configuredPlatforms.includes(p));

    // Build business context
    let businessContext = '';
    if (context.goals) businessContext += `\n## Business Goals\n${context.goals}`;
    if (context.handbook) businessContext += `\n## Brand Voice Guidelines\n${context.handbook}`;

    // Generate platform-specific content
    const platformSpecs = targetPlatforms.map(p =>
      `- ${p.toUpperCase()}: Max ${PLATFORM_LIMITS[p]} characters. ${getPlatformGuidance(p)}`
    ).join('\n');

    const prompt = `You are a professional social media content writer. Generate platform-specific posts based on the following task.

## Task
${task.body}
${businessContext}

## Target Platforms
${platformSpecs}

## Instructions
For each platform, write a tailored post that:
- Respects the character limit strictly
- Matches the platform's tone and format
- Includes relevant hashtags where appropriate
- Has a clear call-to-action

Return your response in this exact JSON format:
{
  "drafts": [
    { "platform": "platform_name", "text": "post content" }
  ]
}

Return ONLY valid JSON, no other text.`;

    const response = await claudeClient.prompt(prompt);
    if (!response.success) {
      return makeErrorResult(`Failed to generate social media content: ${response.error}`);
    }

    let drafts: Array<{ platform: SocialPlatform; text: string }>;
    try {
      const parsed = JSON.parse(response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      drafts = parsed.drafts;
    } catch {
      return makeErrorResult(`Failed to parse social media drafts: ${response.text.substring(0, 200)}`);
    }

    // Enforce character limits
    for (const draft of drafts) {
      const limit = PLATFORM_LIMITS[draft.platform] || 3000;
      if (draft.text.length > limit) {
        draft.text = draft.text.substring(0, limit - 3) + '...';
      }
    }

    // Build approval summary with all drafts
    const approvalText = drafts.map(d =>
      `### ${d.platform.toUpperCase()} (${d.text.length}/${PLATFORM_LIMITS[d.platform]} chars)\n\n${d.text}`
    ).join('\n\n---\n\n');

    logger.info('social_drafts_generated', `Generated ${drafts.length} social media drafts`, task.filename);

    return makeApprovalResult(
      `Social Media Post Drafts:\n\n${approvalText}\n\n---\nPlatforms: ${drafts.map(d => d.platform).join(', ')}\nApprove to publish all drafts?`
    );
  }

  async publishToPlatform(platform: SocialPlatform, text: string): Promise<{ success: boolean; postUrl: string | null; error: string | null }> {
    const result = await this.socialMediaManager.publish(platform, text);
    return { success: result.success, postUrl: result.postUrl, error: result.error };
  }
}

function getPlatformGuidance(platform: SocialPlatform): string {
  switch (platform) {
    case 'twitter': return 'Concise, punchy, use 1-2 hashtags.';
    case 'instagram': return 'Visual-friendly caption, use 5-10 hashtags, emojis welcome.';
    case 'facebook': return 'Longer form, storytelling, professional but engaging.';
    case 'linkedin': return 'Professional tone, thought leadership, 2-4 hashtags.';
    default: return '';
  }
}
