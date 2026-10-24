
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class CacheService {
    private readonly logger = new Logger(CacheService.name);
    private readonly defaultTtl: number;

    constructor(
        private readonly redisService: RedisService,
        private readonly configService: ConfigService,
        private readonly metricsService: MetricsService,
    ) {
        this.defaultTtl =
            this.configService.get<number>('cache.defaultTtl', 60);
    }

    async get<T>(key: string): Promise<T | undefined> {
        const redis = this.redisService.getClient();
        const cachedValue = await redis.get(key);

        if (cachedValue === null) {
            await this.recordCacheMetric(false);
            return undefined;
        }

        try {
            const value = JSON.parse(cachedValue) as T;
            await this.recordCacheMetric(true);
            return value;
        } catch {
            // Remove malformed cache data so it can be rebuilt.
            await redis.del(key);
            await this.recordCacheMetric(false);
            return undefined;
        }
    }

    async set<T>(
        key: string,
        value: T,
        ttlSeconds = this.defaultTtl,
    ): Promise<void> {
        if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
            throw new Error('Cache TTL must be a positive integer');
        }

        const serializedValue = JSON.stringify(value);

        if (serializedValue === undefined) {
            throw new Error('Value cannot be serialized to JSON');
        }

        const redis = this.redisService.getClient();

        await redis.set(key, serializedValue, 'EX', ttlSeconds);
    }

    async delete(key: string): Promise<void> {
        await this.redisService.getClient().del(key);
    }

    async clearByPrefix(prefix: string): Promise<number> {
        const redis = this.redisService.getClient();
        const stream = redis.scanStream({
            match: `${prefix}*`,
            count: 100,
        });

        let deletedCount = 0;

        for await (const keys of stream) {
            if (keys.length > 0) {
                deletedCount += await redis.del(...keys);
            }
        }

        return deletedCount;
    }

    private async recordCacheMetric(hit: boolean): Promise<void> {
        try {
            if (hit) {
                await this.metricsService.recordCacheHit();
            } else {
                await this.metricsService.recordCacheMiss();
            }
        } catch (error) {
            this.logger.warn(
                `Failed to record cache ${hit ? 'hit' : 'miss'} metric: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
}
