import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedRequest } from '../common/guards/api-key.guard';

import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limiter.decorator';
import { RateLimiterService } from './rate-limiter.service';

@Injectable()
export class RateLimiterGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimiterService: RateLimiterService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Routes without rate-limit metadata are not limited by this guard.
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Prefer an authenticated API-key identity.
    // Fall back to the client IP for routes without an API key.
    const identity = request.apiKey
      ? `api-key:${request.apiKey.id}`
      : `ip:${request.ip}`;

    const limit =
      options.limit ??
      request.apiKey?.rateLimit ??
      this.configService.get<number>('rateLimit.defaultLimit', 100);
    const windowSeconds =
      options.windowSeconds ??
      this.configService.get<number>('rateLimit.windowSeconds', 60);

    const result = await this.rateLimiterService.checkLimit(
      identity,
      limit,
      windowSeconds,
    );

    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests',
          limit: result.limit,
          remaining: result.remaining,
          retryAfterSeconds: result.resetAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
