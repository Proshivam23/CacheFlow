
import { IncomingHttpHeaders } from 'node:http';

export interface ProxyRequestDto {
    serviceId: string;
    originalUrl: string;
    method: string;
    headers: IncomingHttpHeaders;
    body?: unknown;
}
