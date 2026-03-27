import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';

@Injectable()
export class SandboxService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
  ) {}

  async createUser(data: Partial<User>): Promise<User> {
    const count = await this.userRepo.count();
    if (count >= 1000) throw new BadRequestException('Sandbox user limit reached');
    const user = this.userRepo.create(data);
    return this.userRepo.save(user);
  }

  async recordTransaction(userId: number, amount: number) {
    const txSum = await this.txRepo
      .createQueryBuilder('tx')
      .select('SUM(tx.amount)', 'sum')
      .where('tx.userId = :userId', { userId })
      .getRawOne();

    if ((txSum.sum || 0) + amount > 10000) {
      throw new BadRequestException('Transaction exceeds sandbox limit');
    }

    const tx = this.txRepo.create({ userId, amount });
    await this.txRepo.save(tx);

    // Notify monitoring module
    // TODO: implement WebSocket broadcast
  }
}