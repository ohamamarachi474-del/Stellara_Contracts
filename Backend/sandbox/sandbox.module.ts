import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SandboxService } from './sandbox.service';
import { SandboxController } from './sandbox.controller';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Transaction])],
  controllers: [SandboxController],
  providers: [SandboxService],
})
export class SandboxModule {}