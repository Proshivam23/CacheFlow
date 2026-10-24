jest.mock('../database/prisma.service', () => ({ PrismaService: jest.fn() }));
jest.mock('@nestjs/config', () => ({ ConfigService: jest.fn() }));
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { ApiKeysService } from './api-keys.service';
import { PrismaService } from '../database/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

describe('API-key rate limits', () => {
  const create = jest.fn().mockResolvedValue({ id: 'key-id' });
  const service = new ApiKeysService(
    { apiKey: { create } } as unknown as PrismaService,
    { get: jest.fn().mockReturnValue(250) } as unknown as ConfigService,
  );

  beforeEach(() => create.mockClear());

  it('persists the configured default when the limit is omitted', async () => {
    await service.create({ name: 'default-client' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rateLimit: 250 }),
      }),
    );
  });

  it('persists an explicit per-key limit', async () => {
    await service.create({ name: 'custom-client', rateLimit: 15 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rateLimit: 15 }),
      }),
    );
  });

  it.each([undefined, 1, 250])(
    'accepts an omitted or positive integer limit: %s',
    async (rateLimit) => {
      const dto = Object.assign(new CreateApiKeyDto(), {
        name: 'client',
        rateLimit,
      });
      expect(await validate(dto)).toHaveLength(0);
    },
  );

  it.each([null, 0, -1, 1.5, '100'])(
    'rejects invalid limits: %s',
    async (rateLimit) => {
      const dto = Object.assign(new CreateApiKeyDto(), {
        name: 'client',
        rateLimit,
      });
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );
});
