import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { RedisModule } from './redis/redis.module';
import { CacheModule } from './cache/cache.module';
import { RateLimiterModule } from './rate-limiter/rate-limiter.module';
import { DatabaseModule } from './database/database.module';
import { ApiKeysModule } from './api-keys/api-key.module';
import { GatewayModule } from './gateway/gateway.module';
import { MetricsModule } from './metrics/metrics.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    DatabaseModule,
    RedisModule,
    CacheModule,
    RateLimiterModule,
    ApiKeysModule,
    GatewayModule,
    MetricsModule,
    HealthModule,
  ],
})
export class AppModule { }