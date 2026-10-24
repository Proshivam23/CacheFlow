
import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface MetricsSnapshot {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    cacheHits: number;
    cacheMisses: number;
    averageLatencyMs: number;
}

const INCREMENT_SCRIPT = `
  return redis.call('INCR', KEYS[1])
`;

@Injectable()
export class MetricsService {
    private readonly prefix = 'metrics:';

    constructor(private readonly redisService: RedisService) { }

    private async increment(name: string): Promise<void> {
        const redis = this.redisService.getClient();

        await redis.eval(
            INCREMENT_SCRIPT,
            1,
            `${this.prefix}${name}`,
        );
    }

    async recordRequest(
        durationMs: number,
        successful: boolean,
    ): Promise<void> {
        const redis = this.redisService.getClient();

        const result = await redis
            .multi()
            .incr(`${this.prefix}total_requests`)
            .incr(
                `${this.prefix}${successful ? 'successful_requests' : 'failed_requests'
                }`,
            )
            .incrby(
                `${this.prefix}latency_total_ms`,
                Math.max(0, Math.round(durationMs)),
            )
            .exec();

        if (result === null) {
            throw new Error('Failed to record request metrics');
        }
    }

    async recordCacheHit(): Promise<void> {
        await this.increment('cache_hits');
    }

    async recordCacheMiss(): Promise<void> {
        await this.increment('cache_misses');
    }

    async getSnapshot(): Promise<MetricsSnapshot> {
        const redis = this.redisService.getClient();

        const keys = [
            'total_requests',
            'successful_requests',
            'failed_requests',
            'cache_hits',
            'cache_misses',
            'latency_total_ms',
        ].map((name) => `${this.prefix}${name}`);

        const values = await redis.mget(...keys);

        const [
            totalRequests,
            successfulRequests,
            failedRequests,
            cacheHits,
            cacheMisses,
            latencyTotalMs,
        ] = values.map((value) => Number(value ?? 0));

        return {
            totalRequests,
            successfulRequests,
            failedRequests,
            cacheHits,
            cacheMisses,
            averageLatencyMs:
                totalRequests > 0
                    ? Math.round(latencyTotalMs / totalRequests)
                    : 0,
        };
    }

    async reset(): Promise<void> {
        const redis = this.redisService.getClient();

        const keys = [
            'total_requests',
            'successful_requests',
            'failed_requests',
            'cache_hits',
            'cache_misses',
            'latency_total_ms',
        ].map((name) => `${this.prefix}${name}`);

        await redis.del(...keys);
    }
}
