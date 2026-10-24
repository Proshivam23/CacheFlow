
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RedisModule } from '../redis/redis.module';
import { MetricsModule } from '../metrics/metrics.module';
import { CacheService } from './cache.service';
import { CacheKeyBuilder } from './cache-key.builder';
import { CacheInterceptor } from './cache.interceptor';

@Module({
  imports: [ConfigModule, RedisModule, MetricsModule],
  providers: [
    CacheService,
    CacheKeyBuilder,
    CacheInterceptor,
  ],
  exports: [
    CacheService,
    CacheKeyBuilder,
    CacheInterceptor,
  ],
})
export class CacheModule { }
