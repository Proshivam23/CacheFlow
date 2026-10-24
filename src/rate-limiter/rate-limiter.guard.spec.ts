jest.mock('@nestjs/config', () => ({ ConfigService: jest.fn() }));
import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { RateLimiterGuard } from './rate-limiter.guard';
import { RateLimiterService } from './rate-limiter.service';
import { RateLimitOptions } from './rate-limiter.decorator';

describe('RateLimiterGuard', () => {
  let options: RateLimitOptions | undefined;
  let request: Record<string, unknown>;
  let guard: RateLimiterGuard;
  const checkLimit = jest.fn();
  const config = {
    get: (key: string) => (key === 'rateLimit.defaultLimit' ? 250 : 90),
  } as unknown as ConfigService;
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    options = {};
    request = { apiKey: { id: 'client-a', rateLimit: 12 }, ip: '127.0.0.1' };
    checkLimit.mockReset().mockResolvedValue({ allowed: true });
    guard = new RateLimiterGuard(
      { getAllAndOverride: () => options } as unknown as Reflector,
      { checkLimit } as unknown as RateLimiterService,
      config,
    );
  });

  it('uses the authenticated key limit and configured window', async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(checkLimit).toHaveBeenCalledWith('api-key:client-a', 12, 90);
  });

  it('shares the same quota across gateway paths for a key', async () => {
    request.originalUrl = '/gateway/service-a/products';
    await guard.canActivate(context);
    request.originalUrl = '/gateway/service-b/orders';
    await guard.canActivate(context);
    expect(checkLimit.mock.calls[0]).toEqual(checkLimit.mock.calls[1]);
  });

  it('keeps different authenticated keys in separate counters', async () => {
    await guard.canActivate(context);
    request.apiKey = { id: 'client-b', rateLimit: 30 };
    await guard.canActivate(context);
    expect(checkLimit).toHaveBeenLastCalledWith('api-key:client-b', 30, 90);
  });

  it('uses IP and environment defaults without authenticated metadata', async () => {
    delete request.apiKey;
    request.headers = { 'x-api-key': 'untrusted-value' };
    await guard.canActivate(context);
    expect(checkLimit).toHaveBeenCalledWith('ip:127.0.0.1', 250, 90);
  });

  it('allows explicit route overrides', async () => {
    options = { limit: 5, windowSeconds: 10 };
    await guard.canActivate(context);
    expect(checkLimit).toHaveBeenCalledWith('api-key:client-a', 5, 10);
  });

  it('leaves undecorated routes unlimited', async () => {
    options = undefined;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(checkLimit).not.toHaveBeenCalled();
  });

  it('returns 429 with the effective limit and remaining window', async () => {
    checkLimit.mockResolvedValue({
      allowed: false,
      limit: 12,
      remaining: 0,
      resetAfterSeconds: 42,
    });
    try {
      await guard.canActivate(context);
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).getResponse()).toMatchObject({
        limit: 12,
        remaining: 0,
        retryAfterSeconds: 42,
      });
    }
  });
});
