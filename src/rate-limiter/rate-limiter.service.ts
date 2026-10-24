
import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    current: number;
    remaining: number;
    resetAfterSeconds: number;
}

const RATE_LIMIT_SCRIPT = `
  local current = redis.call('INCR', KEYS[1])

  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end

  local ttl = redis.call('TTL', KEYS[1])

  return { current, ttl }
`;

@Injectable()
export class RateLimiterService {
    constructor(
        private readonly redisService: RedisService,
    ) { }

    async checkLimit(
        identifier: string,
        limit: number,
        windowSeconds: number,
    ): Promise<RateLimitResult> {
        if (!Number.isInteger(limit) || limit < 1) {
            throw new Error('Rate limit must be a positive integer');
        }

        if (
            !Number.isInteger(windowSeconds) ||
            windowSeconds < 1
        ) {
            throw new Error('Window must be a positive integer');
        }

        const redis = this.redisService.getClient();
        const key = `rate-limit:${identifier}`;

        const result = (await redis.eval(
            RATE_LIMIT_SCRIPT,
            1,
            key,
            windowSeconds,
        )) as [number, number];

        const [current, ttl] = result;

        return {
            allowed: current <= limit,
            limit,
            current,
            remaining: Math.max(0, limit - current),
            resetAfterSeconds: Math.max(0, ttl),
        };
    }
}
