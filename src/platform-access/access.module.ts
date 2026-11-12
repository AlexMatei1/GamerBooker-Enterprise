import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OperationsModule } from '../operations/operations.module';
import { AccessController } from './access.controller';
import { PublicAccessController } from './public-access.controller';
import { AccessService } from './access.service';

@Module({
  imports: [AuthModule, OperationsModule],
  controllers: [AccessController, PublicAccessController],
  providers: [AccessService],
})
export class AccessModule {}
