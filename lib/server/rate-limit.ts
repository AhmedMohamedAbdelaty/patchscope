interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5_000;

export function consumeRateLimit(
  key: string,
  now = Date.now(),
  limit = 30,
  windowMs = 60_000,
): RateLimitResult {
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count++;
  if (buckets.size > MAX_BUCKETS) pruneBuckets(now);
  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function resetRateLimits(): void {
  buckets.clear();
}

function pruneBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now || buckets.size > MAX_BUCKETS) {
      buckets.delete(key);
    }
    if (buckets.size <= MAX_BUCKETS) break;
  }
}
