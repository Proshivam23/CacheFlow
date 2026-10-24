
import {
    GatewayTimeoutException,
    Injectable,
    BadGatewayException,
} from '@nestjs/common';
import { IncomingHttpHeaders } from 'node:http';

import { ProxyRequestDto } from './dto/proxy-request.dto';

export interface ProxyResponse {
    status: number;
    headers: Record<string, string>;
    body: unknown;
}

@Injectable()
export class ProxyService {
    async forward(
        baseUrl: string,
        request: ProxyRequestDto,
    ): Promise<ProxyResponse> {
        let target: URL;

        try {
            target = this.buildTargetUrl(
                baseUrl,
                request.serviceId,
                request.originalUrl,
            );
        } catch {
            throw new BadGatewayException('Invalid upstream URL');
        }

        const headers = this.buildRequestHeaders(request.headers);
        const method = request.method.toUpperCase();

        let body: string | undefined;

        if (
            request.body !== undefined &&
            method !== 'GET' &&
            method !== 'HEAD'
        ) {
            body = JSON.stringify(request.body);
        }

        let upstream: Response;

        try {
            upstream = await fetch(target, {
                method,
                headers,
                body,
                signal: AbortSignal.timeout(10_000),
                redirect: 'manual',
            });
        } catch (error) {
            if (
                error instanceof Error &&
                error.name === 'TimeoutError'
            ) {
                throw new GatewayTimeoutException('Upstream timed out');
            }

            throw new BadGatewayException('Upstream request failed');
        }

        const responseHeaders: Record<string, string> = {};

        for (const name of [
            'content-type',
            'cache-control',
            'etag',
            'last-modified',
            'location',
        ]) {
            const value = upstream.headers.get(name);

            if (value !== null) {
                responseHeaders[name] = value;
            }
        }

        // const bytes = Buffer.from(await upstream.arrayBuffer());

        return {
            status: upstream.status,
            headers: responseHeaders,
            // bodyBase64: bytes.toString('base64'),
            body: await upstream.json(),
        };
    }

    private buildTargetUrl(
        baseUrl: string,
        serviceId: string,
        originalUrl: string,
    ): URL {
        const base = new URL(baseUrl);

        if (
            !['http:', 'https:'].includes(base.protocol) ||
            base.username ||
            base.password
        ) {
            throw new Error('Invalid upstream configuration');
        }

        const incoming = new URL(
            originalUrl,
            'http://cacheflow.invalid',
        );

        const prefix = `/gateway/${serviceId}`;

        if (
            incoming.pathname !== prefix &&
            !incoming.pathname.startsWith(`${prefix}/`)
        ) {
            throw new Error('Invalid gateway path');
        }

        const relativePath = incoming.pathname.slice(prefix.length);
        const basePath = base.pathname.replace(/\/+$/, '');
        const path = relativePath.replace(/^\/+/, '');

        base.pathname = `${basePath}/${path}`.replace(/\/+/g, '/');
        base.search = incoming.search;
        base.hash = '';

        return base;
    }

    private buildRequestHeaders(
        incoming: IncomingHttpHeaders,
    ): Record<string, string> {
        const headers: Record<string, string> = {};

        for (const name of ['accept', 'content-type']) {
            const value = incoming[name];

            if (typeof value === 'string') {
                headers[name] = value;
            }
        }

        return headers;
    }
}
