import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';

import { PrismaService } from '../database/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  async create(dto: CreateApiKeyDto) {
    const rawKey = `cf_${randomBytes(32).toString('hex')}`;

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        keyHash: this.hashKey(rawKey),
        rateLimit:
          dto.rateLimit ??
          this.config.get<number>('rateLimit.defaultLimit', 100),
      },
      select: {
        id: true,
        name: true,
        rateLimit: true,
        isRevoked: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    // Show the raw key only once. Never store it in the database.
    return {
      ...apiKey,
      apiKey: rawKey,
    };
  }

  async validate(rawKey: string) {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: {
        keyHash: this.hashKey(rawKey),
      },
    });

    if (!apiKey || apiKey.isRevoked) {
      return null;
    }

    if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    return {
      id: apiKey.id,
      name: apiKey.name,
      rateLimit: apiKey.rateLimit,
    };
  }

  async findAll() {
    return this.prisma.apiKey.findMany({
      select: {
        id: true,
        name: true,
        rateLimit: true,
        isRevoked: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async revoke(id: string) {
    const existing = await this.prisma.apiKey.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('API key not found');
    }

    return this.prisma.apiKey.update({
      where: { id },
      data: { isRevoked: true },
      select: {
        id: true,
        name: true,
        isRevoked: true,
      },
    });
  }
}
