
import { Controller, Get } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
    constructor(private readonly metricsService: MetricsService) { }

    @Get()
    getMetrics() {
        return this.metricsService.getSnapshot();
    }

    @Get('cache')
    async getCacheMetrics() {
        const metrics = await this.metricsService.getSnapshot();
        const total = metrics.cacheHits + metrics.cacheMisses;

        return {
            hits: metrics.cacheHits,
            misses: metrics.cacheMisses,
            hitRatio: total > 0 ? metrics.cacheHits / total : 0,
        };
    }
}
