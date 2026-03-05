import https from 'https';

export interface FacebookConfig {
  pageId: string;
  pageAccessToken: string;
}

export interface FacebookPostResult {
  success: boolean;
  postId: string | null;
  postUrl: string | null;
  error: string | null;
}

export interface FacebookEngagement {
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
}

export class FacebookClient {
  private config: FacebookConfig;
  private dryRun: boolean;

  constructor(config: FacebookConfig, dryRun = false) {
    this.config = config;
    this.dryRun = dryRun;
  }

  isConfigured(): boolean {
    return !!this.config.pageId && !!this.config.pageAccessToken;
  }

  async publish(text: string): Promise<FacebookPostResult> {
    if (this.dryRun) {
      return { success: true, postId: 'dry-run-fb-post', postUrl: `https://facebook.com/${this.config.pageId}/posts/dry-run`, error: null };
    }

    try {
      const result = await this.graphApi('POST', `/${this.config.pageId}/feed`, { message: text });
      const postId = (result as { id: string }).id;
      return {
        success: true,
        postId,
        postUrl: `https://facebook.com/${postId}`,
        error: null,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, postId: null, postUrl: null, error: msg };
    }
  }

  async getEngagement(postId: string): Promise<FacebookEngagement> {
    if (this.dryRun) {
      return { likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0 };
    }

    try {
      const result = await this.graphApi('GET', `/${postId}`, { fields: 'likes.summary(true),comments.summary(true),shares' });
      const data = result as Record<string, unknown>;
      const likes = (data.likes as Record<string, unknown>)?.summary as Record<string, number> | undefined;
      const comments = (data.comments as Record<string, unknown>)?.summary as Record<string, number> | undefined;
      const shares = data.shares as Record<string, number> | undefined;

      return {
        likes: likes?.total_count || 0,
        comments: comments?.total_count || 0,
        shares: shares?.count || 0,
        impressions: 0,
        reach: 0,
      };
    } catch {
      return { likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0 };
    }
  }

  private graphApi(method: string, endpoint: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const queryParams = method === 'GET'
        ? `?${new URLSearchParams({ ...params as Record<string, string>, access_token: this.config.pageAccessToken }).toString()}`
        : `?access_token=${this.config.pageAccessToken}`;

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
          } catch { reject(new Error(`Facebook API parse error: ${data.substring(0, 200)}`)); }
        });
      });

      req.on('error', (e) => reject(new Error(`Facebook API error: ${e.message}`)));
      if (body) req.write(body);
      req.end();
    });
  }
}
