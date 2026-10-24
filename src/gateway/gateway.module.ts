
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '../database/database.module';
import { CacheModule } from '../cache/cache.module';
import { ApiKeysModule } from '../api-keys/api-key.module';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { MetricsModule } from '../metrics/metrics.module';

import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { ProxyService } from './proxy.service';

@Module({
    imports: [
        ConfigModule,
        DatabaseModule,
        CacheModule,
        ApiKeysModule,
        RateLimiterModule,
        MetricsModule,
    ],
    controllers: [GatewayController],
    providers: [
        GatewayService,
        ProxyService,
        ApiKeyGuard,
    ],
})
export class GatewayModule { }
