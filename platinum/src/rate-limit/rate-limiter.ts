import { RateLimitConfig } from '../config/platinum-config';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  requestsThisMinute: number;
  requestsThisHour: number;
  minuteStart: number;
  hourStart: number;
}

export class RateLimiter {
  private config: RateLimitConfig;
  private buckets: Map<string, TokenBucket> = new Map();

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  canProceed(serviceKey: string): boolean {
    const bucket = this.getOrCreateBucket(serviceKey);
    this.refillTokens(bucket);

    return bucket.tokens > 0 &&
      bucket.requestsThisMinute < this.config.maxRequestsPerMinute &&
      bucket.requestsThisHour < this.config.maxRequestsPerHour;
  }

  recordRequest(serviceKey: string): void {
    const bucket = this.getOrCreateBucket(serviceKey);
    this.refillTokens(bucket);

    bucket.tokens = Math.max(0, bucket.tokens - 1);
    bucket.requestsThisMinute++;
    bucket.requestsThisHour++;
  }

  getWaitTime(serviceKey: string): number {
    const bucket = this.getOrCreateBucket(serviceKey);
    this.refillTokens(bucket);

    if (this.canProceed(serviceKey)) return 0;

    // Calculate time until next token
    const now = Date.now();
    const minuteRemaining = 60000 - (now - bucket.minuteStart);
    const hourRemaining = 3600000 - (now - bucket.hourStart);

    if (bucket.requestsThisMinute >= this.config.maxRequestsPerMinute) {
      return Math.max(0, minuteRemaining);
    }

    if (bucket.requestsThisHour >= this.config.maxRequestsPerHour) {
      return Math.max(0, hourRemaining);
    }

    // Token bucket refill time
    const refillRate = this.config.maxRequestsPerMinute / 60000; // tokens per ms
    if (bucket.tokens <= 0) {
      return Math.ceil(1 / refillRate);
    }

    return 0;
  }

  private getOrCreateBucket(serviceKey: string): TokenBucket {
    if (!this.buckets.has(serviceKey)) {
      const now = Date.now();
      this.buckets.set(serviceKey, {
        tokens: this.config.burstSize,
        lastRefill: now,
        requestsThisMinute: 0,
        requestsThisHour: 0,
        minuteStart: now,
        hourStart: now,
      });
    }
    return this.buckets.get(serviceKey)!;
  }

  private refillTokens(bucket: TokenBucket): void {
    const now = Date.now();

    // Reset minute counter
    if (now - bucket.minuteStart >= 60000) {
      bucket.requestsThisMinute = 0;
      bucket.minuteStart = now;
    }

    // Reset hour counter
    if (now - bucket.hourStart >= 3600000) {
      bucket.requestsThisHour = 0;
      bucket.hourStart = now;
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refillRate = this.config.maxRequestsPerMinute / 60000;
    const newTokens = elapsed * refillRate;
    bucket.tokens = Math.min(this.config.burstSize, bucket.tokens + newTokens);
    bucket.lastRefill = now;
  }
}
