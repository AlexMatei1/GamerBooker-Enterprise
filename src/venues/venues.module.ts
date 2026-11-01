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
import { LayoutController } from './layout.controller';
import { LayoutService } from './layout.service';

@Module({
  imports: [AuthModule],
  controllers: [
    VenuesController,
    WizardController,
    ResourceManagerController,
    OperationsController,
    LayoutController,
  ],
  providers: [
    VenuesService,
    WizardService,
    ResourceManagerService,
    OperationsService,
    LayoutService,
  ],
  exports: [
    VenuesService,
    WizardService,
    ResourceManagerService,
    OperationsService,
    LayoutService,
  ],
})
export class VenuesModule {}
