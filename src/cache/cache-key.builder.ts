
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Request } from 'express';

@Injectable()
export class CacheKeyBuilder {
    build(request: Request): string {
        const method = request.method.toUpperCase();
        const path = request.originalUrl;

        const normalizedPath = path.split('?')[0];

        // Sort query parameters so equivalent queries produce
        // the same key regardless of parameter order.
        const query = new URLSearchParams(
            path.split('?')[1] ?? '',
        );

        query.sort();

        const identity = JSON.stringify({
            method,
            path: normalizedPath,
            query: query.toString(),
        });

        const hash = createHash('sha256')
            .update(identity)
            .digest('hex');

        return `cache:${hash}`;
    }
}
