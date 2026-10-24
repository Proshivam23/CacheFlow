
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RedisModule } from '../redis/redis.module';
import { RateLimiterService } from './rate-limiter.service';
import { RateLimiterGuard } from './rate-limiter.guard';

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [
    RateLimiterService,
    RateLimiterGuard,
  ],
  exports: [
    RateLimiterService,
    RateLimiterGuard,
  ],
})
export class RateLimiterModule { }
