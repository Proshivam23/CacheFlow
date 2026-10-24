
import {
    Controller,
    Get,
    ServiceUnavailableException,
} from '@nestjs/common';

import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../database/prisma.service';

@Controller('health')
export class HealthController {
    constructor(
        private readonly redisService: RedisService,
        private readonly prisma: PrismaService,
    ) { }

    @Get()
    async checkHealth() {
        const [redisResult, databaseResult] = await Promise.allSettled([
            this.redisService.ping(),
            this.prisma.$queryRaw`SELECT 1`,
        ]);

        const redisHealthy =
            redisResult.status === 'fulfilled' &&
            redisResult.value === 'PONG';

        const databaseHealthy = databaseResult.status === 'fulfilled';

        const response = {
            status:
                redisHealthy && databaseHealthy ? 'ok' : 'error',
            checks: {
                application: 'ok',
                redis: redisHealthy ? 'ok' : 'error',
                database: databaseHealthy ? 'ok' : 'error',
            },
            timestamp: new Date().toISOString(),
        };

        if (!redisHealthy || !databaseHealthy) {
            throw new ServiceUnavailableException(response);
        }

        return response;
    }
}
