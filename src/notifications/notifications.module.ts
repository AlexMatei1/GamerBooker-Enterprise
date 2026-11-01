import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TemplatesService } from './templates.service';
import { NotificationsService } from './notifications.service';
import { ReceiptsService } from './receipts.service';
import { OrderStatusService } from './order-status.service';
import { NotificationsController } from './notifications.controller';
import { ReceiptsController } from './receipts.controller';

@Module({
  imports: [AuthModule],
  providers: [TemplatesService, NotificationsService, ReceiptsService, OrderStatusService],
  controllers: [NotificationsController, ReceiptsController],
  exports: [TemplatesService, NotificationsService, ReceiptsService, OrderStatusService],
})
export class NotificationsModule {}
