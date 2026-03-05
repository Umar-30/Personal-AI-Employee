import https from 'https';

export interface InstagramConfig {
  businessAccountId: string;
  accessToken: string;
}

export interface InstagramPostResult {
  success: boolean;
  postId: string | null;
  postUrl: string | null;
  error: string | null;
}

export interface InstagramEngagement {
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
}

export class InstagramClient {
  private config: InstagramConfig;
  private dryRun: boolean;

  constructor(config: InstagramConfig, dryRun = false) {
    this.config = config;
    this.dryRun = dryRun;
  }

  isConfigured(): boolean {
    return !!this.config.businessAccountId && !!this.config.accessToken;
  }

  async publish(text: string, imageUrl?: string): Promise<InstagramPostResult> {
    if (this.dryRun) {
      return { success: true, postId: 'dry-run-ig-post', postUrl: `https://instagram.com/p/dry-run`, error: null };
    }

    try {
      // Instagram requires an image for feed posts — use a caption-only carousel or image post
      if (!imageUrl) {
        return { success: false, postId: null, postUrl: null, error: 'Instagram requires an image URL for feed posts. Text-only posts are not supported.' };
      }

      // Step 1: Create media container
      const container = await this.graphApi('POST', `/${this.config.businessAccountId}/media`, {
        caption: text,
        image_url: imageUrl,
      });
      const containerId = (container as { id: string }).id;

      // Step 2: Publish the container
      const result = await this.graphApi('POST', `/${this.config.businessAccountId}/media_publish`, {
        creation_id: containerId,
      });
      const postId = (result as { id: string }).id;

      return {
        success: true,
        postId,
        postUrl: `https://instagram.com/p/${postId}`,
        error: null,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, postId: null, postUrl: null, error: msg };
    }
  }

  async getEngagement(postId: string): Promise<InstagramEngagement> {
    if (this.dryRun) {
      return { likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0 };
    }

    try {
      const result = await this.graphApi('GET', `/${postId}/insights`, {
        metric: 'impressions,reach,likes,comments',
      });
      const data = (result as { data: Array<{ name: string; values: Array<{ value: number }> }> }).data || [];
      const getMetric = (name: string) => {
        const metric = data.find(d => d.name === name);
        return metric?.values?.[0]?.value || 0;
      };

      return {
        likes: getMetric('likes'),
        comments: getMetric('comments'),
        shares: 0,
        impressions: getMetric('impressions'),
        reach: getMetric('reach'),
      };
    } catch {
      return { likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0 };
    }
  }

  private graphApi(method: string, endpoint: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const queryParams = method === 'GET'
        ? `?${new URLSearchParams({ ...params as Record<string, string>, access_token: this.config.accessToken }).toString()}`
        : `?access_token=${this.config.accessToken}`;

      const body = method === 'POST' ? JSON.stringify(params) : undefined;

      const req = https.request({
        hostname: 'graph.facebook.com',
        path: `/v19.0${endpoint}${queryParams}`,
        method,
        headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {},
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) reject(new Error(parsed.error.message));
            else resolve(parsed);
          } catch { reject(new Error(`Instagram API parse error: ${data.substring(0, 200)}`)); }
        });
      });

      req.on('error', (e) => reject(new Error(`Instagram API error: ${e.message}`)));
      if (body) req.write(body);
      req.end();
    });
  }
}
