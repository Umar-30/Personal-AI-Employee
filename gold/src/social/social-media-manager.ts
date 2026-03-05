import { FacebookClient } from './facebook-client';
import { InstagramClient } from './instagram-client';
import { TwitterClient } from './twitter-client';
import { Logger } from '../../../bronze/src/logging/logger';

export type SocialPlatform = 'facebook' | 'instagram' | 'twitter' | 'linkedin';

export interface PlatformPostResult {
  success: boolean;
  platform: SocialPlatform;
  postId: string | null;
  postUrl: string | null;
  error: string | null;
}

export interface PlatformEngagement {
  platform: SocialPlatform;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
  fetchedAt: string;
}

export class SocialMediaManager {
  private facebook: FacebookClient;
  private instagram: InstagramClient;
  private twitter: TwitterClient;
  private logger: Logger;

  constructor(
    facebook: FacebookClient,
    instagram: InstagramClient,
    twitter: TwitterClient,
    logger: Logger,
  ) {
    this.facebook = facebook;
    this.instagram = instagram;
    this.twitter = twitter;
    this.logger = logger;
  }

  async publish(platform: SocialPlatform, text: string, mediaUrls?: string[]): Promise<PlatformPostResult> {
    this.logger.info('social_publish_start', `Publishing to ${platform} (${text.length} chars)`, undefined);

    let result: PlatformPostResult;

    switch (platform) {
      case 'facebook': {
        const fbResult = await this.facebook.publish(text);
        result = { ...fbResult, platform: 'facebook' };
        break;
      }
      case 'instagram': {
        const imageUrl = mediaUrls?.[0];
        const igResult = await this.instagram.publish(text, imageUrl);
        result = { ...igResult, platform: 'instagram' };
        break;
      }
      case 'twitter': {
        const twResult = await this.twitter.publish(text);
        result = { ...twResult, platform: 'twitter' };
        break;
      }
      case 'linkedin': {
        // LinkedIn is handled by Silver's LinkedInPostSkill via MCP
        result = { success: false, platform: 'linkedin', postId: null, postUrl: null, error: 'LinkedIn posting is handled via MCP. Use LinkedInPostSkill instead.' };
        break;
      }
      default:
        result = { success: false, platform, postId: null, postUrl: null, error: `Unknown platform: ${platform}` };
    }

    if (result.success) {
      this.logger.info('social_publish_success', `Published to ${platform}: ${result.postUrl}`, undefined);
    } else {
      this.logger.error('social_publish_failed', `Failed to publish to ${platform}: ${result.error}`, result.error || undefined, undefined);
    }

    return result;
  }

  async getEngagement(platform: SocialPlatform, postId: string): Promise<PlatformEngagement> {
    let engagement = { likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0 };

    switch (platform) {
      case 'facebook':
        engagement = await this.facebook.getEngagement(postId);
        break;
      case 'instagram':
        engagement = await this.instagram.getEngagement(postId);
        break;
      case 'twitter':
        engagement = await this.twitter.getEngagement(postId);
        break;
    }

    return {
      ...engagement,
      platform,
      fetchedAt: new Date().toISOString(),
    };
  }

  isConfigured(platform: SocialPlatform): boolean {
    switch (platform) {
      case 'facebook': return this.facebook.isConfigured();
      case 'instagram': return this.instagram.isConfigured();
      case 'twitter': return this.twitter.isConfigured();
      case 'linkedin': return true; // Handled by Silver MCP
      default: return false;
    }
  }

  getConfiguredPlatforms(): SocialPlatform[] {
    const platforms: SocialPlatform[] = [];
    if (this.facebook.isConfigured()) platforms.push('facebook');
    if (this.instagram.isConfigured()) platforms.push('instagram');
    if (this.twitter.isConfigured()) platforms.push('twitter');
    platforms.push('linkedin'); // Always available via Silver MCP
    return platforms;
  }
}
