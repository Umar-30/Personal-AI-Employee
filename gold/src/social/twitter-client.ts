import https from 'https';
import crypto from 'crypto';

export interface TwitterConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export interface TwitterPostResult {
  success: boolean;
  postId: string | null;
  postUrl: string | null;
  error: string | null;
}

export interface TwitterEngagement {
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
}

export class TwitterClient {
  private config: TwitterConfig;
  private dryRun: boolean;

  constructor(config: TwitterConfig, dryRun = false) {
    this.config = config;
    this.dryRun = dryRun;
  }

  isConfigured(): boolean {
    return !!this.config.apiKey && !!this.config.accessToken;
  }

  async publish(text: string): Promise<TwitterPostResult> {
    if (this.dryRun) {
      return { success: true, postId: 'dry-run-tweet', postUrl: 'https://twitter.com/user/status/dry-run', error: null };
    }

    try {
      const result = await this.apiRequest('POST', '/2/tweets', { text });
      const data = (result as { data: { id: string } }).data;
      return {
        success: true,
        postId: data.id,
        postUrl: `https://twitter.com/i/status/${data.id}`,
        error: null,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, postId: null, postUrl: null, error: msg };
    }
  }

  async getEngagement(postId: string): Promise<TwitterEngagement> {
    if (this.dryRun) {
      return { likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0 };
    }

    try {
      const result = await this.apiRequest('GET', `/2/tweets/${postId}?tweet.fields=public_metrics`);
      const metrics = ((result as Record<string, unknown>).data as Record<string, unknown>)?.public_metrics as Record<string, number> | undefined;
      return {
        likes: metrics?.like_count || 0,
        comments: metrics?.reply_count || 0,
        shares: metrics?.retweet_count || 0,
        impressions: metrics?.impression_count || 0,
        reach: 0,
      };
    } catch {
      return { likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0 };
    }
  }

  private generateOAuthHeader(method: string, url: string, body?: Record<string, unknown>): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.config.apiKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_token: this.config.accessToken,
      oauth_version: '1.0',
    };

    // Build signature base string
    const allParams = { ...oauthParams };
    const paramString = Object.keys(allParams)
      .sort()
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
      .join('&');

    const signatureBase = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(paramString)}`;
    const signingKey = `${encodeURIComponent(this.config.apiSecret)}&${encodeURIComponent(this.config.accessTokenSecret)}`;
    const signature = crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');

    oauthParams.oauth_signature = signature;

    return 'OAuth ' + Object.keys(oauthParams)
      .sort()
      .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
      .join(', ');
  }

  private apiRequest(method: string, endpoint: string, body?: Record<string, unknown>): Promise<unknown> {
    const url = `https://api.twitter.com${endpoint}`;
    const cleanUrl = url.split('?')[0];
    const authHeader = this.generateOAuthHeader(method, cleanUrl, body);
    const bodyStr = body ? JSON.stringify(body) : undefined;

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const req = https.request({
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr).toString() } : {}),
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.errors) reject(new Error(parsed.errors[0]?.message || JSON.stringify(parsed.errors)));
            else if (res.statusCode && res.statusCode >= 400) reject(new Error(`Twitter API ${res.statusCode}: ${data.substring(0, 200)}`));
            else resolve(parsed);
          } catch { reject(new Error(`Twitter API parse error: ${data.substring(0, 200)}`)); }
        });
      });

      req.on('error', (e) => reject(new Error(`Twitter API error: ${e.message}`)));
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }
}
