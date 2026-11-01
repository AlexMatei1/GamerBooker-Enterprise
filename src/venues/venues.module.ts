import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';
import { WizardController } from './wizard.controller';
import { WizardService } from './wizard.service';
import { ResourceManagerController } from './resource-manager.controller';
import { ResourceManagerService } from './resource-manager.service';

@Module({
  imports: [AuthModule],
  controllers: [
    VenuesController,
    WizardController,
    ResourceManagerController,
  ],
  providers: [
    VenuesService,
    WizardService,
    ResourceManagerService,
  ],
  exports: [
    VenuesService,
    WizardService,
    ResourceManagerService,
  ],
})
export class VenuesModule {}
