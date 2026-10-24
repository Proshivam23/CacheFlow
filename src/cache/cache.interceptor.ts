
import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, from, of } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { Request } from 'express';

import { CacheService } from './cache.service';
import { CacheKeyBuilder } from './cache-key.builder';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
    private readonly defaultTtl: number;

    constructor(
        private readonly cacheService: CacheService,
        private readonly keyBuilder: CacheKeyBuilder,
        configService: ConfigService,
    ) {
        this.defaultTtl =
            configService.get<number>('cache.defaultTtl', 60);
    }

    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        const request = context
            .switchToHttp()
            .getRequest<Request>();

        // Only cache GET requests.
        if (request.method !== 'GET') {
            return next.handle();
        }

        const key = this.keyBuilder.build(request);

        return from(this.cacheService.get<unknown>(key)).pipe(
            // Cache failure should not prevent the backend from responding.
            catchError(() => of(undefined)),

            mergeMap((cachedValue) => {
                if (cachedValue !== undefined) {
                    return of(cachedValue);
                }

                // Cache miss: execute the original handler.
                return next.handle().pipe(
                    mergeMap(async (response) => {
                        if (response !== undefined) {
                            try {
                                await this.cacheService.set(
                                    key,
                                    response,
                                    this.defaultTtl,
                                );
                            } catch {
                                // Preserve the API response if caching fails.
                            }
                        }

                        return response;
                    }),
                );
            }),
        );
    }
}
