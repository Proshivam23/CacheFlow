import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';
import { RedisService } from '../redis/redis.service';
import { MetricsService } from '../metrics/metrics.service';

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: RedisService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(60),
          },
        },
        {
          provide: MetricsService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
