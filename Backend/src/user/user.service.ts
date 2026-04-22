import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class UserService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly prisma: PrismaService,
  ) {}

  async getUserById(id: string): Promise<User | null> {
    const cached = await this.cacheManager.get<User>(`user:${id}`);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;

    await this.cacheManager.set(`user:${id}`, user, 300000); // 5 min TTL in ms
    return user;
  }

  async invalidateUserCache(id: string) {
    await this.cacheManager.del(`user:${id}`);
  }
}
