import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';
import { WizardController } from './wizard.controller';
import { WizardService } from './wizard.service';
import { ResourceManagerController } from './resource-manager.controller';
import { ResourceManagerService } from './resource-manager.service';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [AuthModule],
  controllers: [
    VenuesController,
    WizardController,
    ResourceManagerController,
    OperationsController,
  ],
  providers: [
    VenuesService,
    WizardService,
    ResourceManagerService,
    OperationsService,
  ],
  exports: [
    VenuesService,
    WizardService,
    ResourceManagerService,
    OperationsService,
  ],
})
export class VenuesModule {}
