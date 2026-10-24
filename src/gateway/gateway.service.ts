
import {
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CacheKeyBuilder } from '../cache/cache-key.builder';
import { AuthenticatedRequest } from '../common/guards/api-key.guard';
import { ProxyService, ProxyResponse } from './proxy.service';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class GatewayService {
    private readonly logger = new Logger(GatewayService.name);
    private readonly cacheTtl: number;

    constructor(
        private readonly prisma: PrismaService,
        private readonly cacheService: CacheService,
        private readonly cacheKeyBuilder: CacheKeyBuilder,
        private readonly proxyService: ProxyService,
        private readonly metricsService: MetricsService,
        config: ConfigService,
    ) {
        this.cacheTtl = config.get<number>('cache.defaultTtl', 60);
    }

    async handleRequest(
        serviceId: string,
        request: AuthenticatedRequest,
    ): Promise<ProxyResponse> {
        const upstream = await this.prisma.upstreamService.findUnique({
            where: { id: serviceId },
        });

        if (!upstream || !upstream.isActive) {
            throw new NotFoundException('Upstream service not found');
        }

        const canCache = request.method.toUpperCase() === 'GET';
        const cacheKey = canCache
            ? `${this.cacheKeyBuilder.build(request)}:client:${request.apiKey!.id}`
            : undefined;

        if (cacheKey) {
            try {
                const cached =
                    await this.cacheService.get<ProxyResponse>(cacheKey);

                if (cached) {
                    return cached;
                }
            } catch {
                // Redis failure should not prevent proxying the request.
            }
        }

        const startedAt = Date.now();

        let response: ProxyResponse;
        try {
            response = await this.proxyService.forward(
                upstream.baseUrl,
                {
                    serviceId,
                    originalUrl: request.originalUrl,
                    method: request.method,
                    headers: request.headers,
                    body: request.body,
                },
            );
        } catch (error) {
            await this.recordRequestMetric(
                Date.now() - startedAt,
                false,
            );

            throw error;
        }

        await this.recordRequestMetric(
            Date.now() - startedAt,
            response.status >= 200 && response.status < 400,
        );

        const cacheControl = response.headers['cache-control'] ?? '';
        const isSuccessful =
            response.status >= 200 && response.status < 300;
        const allowsCaching = !/\b(no-store|private)\b/i.test(cacheControl);

        if (cacheKey && isSuccessful && allowsCaching) {
            try {
                await this.cacheService.set(
                    cacheKey,
                    response,
                    this.cacheTtl,
                );
            } catch {
                // Return the upstream response even if caching fails.
            }
        }

        return response;
    }

    private async recordRequestMetric(
        durationMs: number,
        successful: boolean,
    ): Promise<void> {
        try {
            await this.metricsService.recordRequest(durationMs, successful);
        } catch (error) {
            this.logger.warn(
                `Failed to record request metrics: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
}
