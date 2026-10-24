import {
    Injectable,
    OnModuleDestroy,
    OnModuleInit,
    Inject,
    Logger,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy, OnModuleInit {
    private readonly logger = new Logger(RedisService.name);

    constructor(
        @Inject(REDIS_CLIENT)
        private readonly redis: Redis
    ) { }

    async onModuleInit(): Promise<void> {
        this.logger.log('Initializing Redis client...');
        await this.redis.ping();
        this.logger.log('Redis client initialized successfully.');
    }

    async onModuleDestroy(): Promise<void> {
        await this.redis.quit();
    }

    getClient(): Redis {
        return this.redis;
    }

    async ping(): Promise<string> {
        return this.redis.ping();
    }
}
