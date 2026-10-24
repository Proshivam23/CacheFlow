import {
  All,
  Controller,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';

import {
  ApiKeyGuard,
  AuthenticatedRequest,
} from '../common/guards/api-key.guard';
import { RateLimiterGuard } from '../rate-limiter/rate-limiter.guard';
import { RateLimit } from '../rate-limiter/rate-limiter.decorator';
import { GatewayService } from './gateway.service';

@Controller('gateway')
@UseGuards(ApiKeyGuard, RateLimiterGuard)
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  @All(':serviceId/*')
  @RateLimit()
  async proxy(
    @Param('serviceId', new ParseUUIDPipe()) serviceId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.gatewayService.handleRequest(
      serviceId,
      request as AuthenticatedRequest,
    );

    response.status(result.status);

    for (const [name, value] of Object.entries(result.headers)) {
      response.setHeader(name, value);
    }

    response.json(result.body);
  }
}
