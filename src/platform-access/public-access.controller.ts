import { Body, Controller, Post } from '@nestjs/common';
import { AccessService } from './access.service';

@Controller('public')
export class PublicAccessController {
  constructor(private readonly access: AccessService) {}

  @Post('partner-application')
  submitPartnerApplication(@Body() body: unknown) {
    return this.access.publicApply(body);
  }
}
