
import { Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module';
import { DatabaseModule } from '../database/database.module';
import { HealthController } from './health.controller';

@Module({
    imports: [RedisModule, DatabaseModule],
    controllers: [HealthController],
})
export class HealthModule { }
