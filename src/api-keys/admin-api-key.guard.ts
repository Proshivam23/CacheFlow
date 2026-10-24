
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
    constructor(private readonly config: ConfigService) { }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        const supplied = request.headers['x-admin-token'];
        const expected = this.config.get<string>('ADMIN_API_TOKEN');

        if (!expected || typeof supplied !== 'string') {
            throw new UnauthorizedException('Invalid admin token');
        }

        const suppliedBuffer = Buffer.from(supplied);
        const expectedBuffer = Buffer.from(expected);

        if (
            suppliedBuffer.length !== expectedBuffer.length ||
            !timingSafeEqual(suppliedBuffer, expectedBuffer)
        ) {
            throw new UnauthorizedException('Invalid admin token');
        }

        return true;
    }
}
