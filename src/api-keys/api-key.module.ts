
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '../database/database.module';
import { ApiKeysController } from './api-key.controller';
import { ApiKeysService } from './api-keys.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';

@Module({
    imports: [ConfigModule, DatabaseModule],
    controllers: [ApiKeysController],
    providers: [ApiKeysService, AdminApiKeyGuard],
    exports: [ApiKeysService],
})
export class ApiKeysModule { }
