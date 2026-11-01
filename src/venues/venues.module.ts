import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';
import { WizardController } from './wizard.controller';
import { WizardService } from './wizard.service';

@Module({
  imports: [AuthModule],
  controllers: [VenuesController, WizardController],
  providers: [VenuesService, WizardService],
  exports: [VenuesService, WizardService],
})
export class VenuesModule {}
