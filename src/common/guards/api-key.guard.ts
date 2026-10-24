
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

import { ApiKeysService } from '../../api-keys/api-keys.service';

export interface AuthenticatedApiKey {
    id: string;
    name: string;
    rateLimit: number;
}

export type AuthenticatedRequest = Request & {
    apiKey?: AuthenticatedApiKey;
};

@Injectable()
export class ApiKeyGuard implements CanActivate {
    constructor(private readonly apiKeysService: ApiKeysService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();

        const rawKey = request.headers['x-api-key'];

        if (typeof rawKey !== 'string' || rawKey.length === 0) {
            throw new UnauthorizedException('API key is required');
        }

        const apiKey = await this.apiKeysService.validate(rawKey);

        if (!apiKey) {
            throw new UnauthorizedException('Invalid or revoked API key');
        }

        // Store only validated metadata, never the raw secret.
        request.apiKey = apiKey;

        return true;
    }
}
