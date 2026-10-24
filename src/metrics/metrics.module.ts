
import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
    imports: [RedisModule],
    controllers: [MetricsController],
    providers: [MetricsService],
    exports: [MetricsService],
})
export class MetricsModule { }
