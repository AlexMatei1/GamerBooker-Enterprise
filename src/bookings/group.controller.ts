import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';
import { GroupService } from './group.service';
import { PaymentsService } from '../payments/payments.service';
import type { CreateGroupBookingDto, AdjustSharesDto } from './group.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller('group-bookings')
export class GroupController {
  constructor(
    private readonly groupService: GroupService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  async createGroupBooking(
    @Body() body: CreateGroupBookingDto,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (!body?.quote_id || !body?.mode) {
      throw new BadRequestException({
        code: 'MISSING_GROUP_FIELDS',
        message: 'Must provide quote_id and mode (ORGANIZER_PAYS_ALL or SPLIT_BY_PARTICIPANT)',
      });
    }

    const principal = req.auth as SessionPrincipal;
    const requestId = (req.headers['x-request-id'] as string) || '';

    const group = await this.groupService.createGroupBooking(
      principal.userId,
      body,
      requestId,
    );
    return { group_booking: group };
  }

  @Get(':id')
  @UseGuards(SessionGuard)
  async getGroupBooking(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const group = await this.groupService.getGroupBooking(principal.userId, id, false);
    return { group_booking: group };
  }

  @Patch(':id/shares')
  @UseGuards(SessionGuard)
  async adjustShares(
    @Param('id') id: string,
    @Body() body: AdjustSharesDto,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (!body?.shares || !Array.isArray(body.shares)) {
      throw new BadRequestException({
        code: 'MISSING_SHARES',
        message: 'Must provide shares array',
      });
    }

    const principal = req.auth as SessionPrincipal;
    const requestId = (req.headers['x-request-id'] as string) || '';

    const group = await this.groupService.adjustShares(
      principal.userId,
      id,
      body,
      requestId,
    );
    return { group_booking: group };
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async acceptInvitation(
    @Body() body: { token: string },
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (!body?.token) {
      throw new BadRequestException({
        code: 'MISSING_INVITATION_TOKEN',
        message: 'Must provide invitation token',
      });
    }

    const principal = req.auth as SessionPrincipal;
    const requestId = (req.headers['x-request-id'] as string) || '';

    const participant = await this.groupService.acceptInvitation(
      principal.userId,
      body.token,
      requestId,
    );
    return { participant, accepted: true };
  }

  @Post('invitations/decline')
  @HttpCode(HttpStatus.OK)
  async declineInvitation(
    @Body() body: { token: string },
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (!body?.token) {
      throw new BadRequestException({
        code: 'MISSING_INVITATION_TOKEN',
        message: 'Must provide invitation token',
      });
    }

    const requestId = (req.headers['x-request-id'] as string) || '';
    const callerUserId = req.auth?.userId;
    const result = await this.groupService.declineInvitation(body.token, requestId, callerUserId);
    return result;
  }

  // ---------------------------------------------------------------------------
  // ENG-302: Checkout, Payment Intents & Expiry Endpoints
  // ---------------------------------------------------------------------------

  @Post(':id/checkout/initiate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async initiateCheckout(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const requestId = (req.headers['x-request-id'] as string) || '';
    const checkout = await this.groupService.initiateCheckout(principal.userId, id, requestId);
    return { checkout };
  }

  @Post(':id/payment-intent')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  async createPaymentIntent(
    @Param('id') id: string,
    @Body() body: { participant_id?: string },
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const requestId = (req.headers['x-request-id'] as string) || '';
    const paymentIntent = await this.groupService.createPaymentIntent(
      principal.userId,
      id,
      body?.participant_id,
      requestId,
    );
    return { payment_intent: paymentIntent };
  }

  @Post(':id/expire')
  @HttpCode(HttpStatus.OK)
  async expireGroupBooking(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const requestId = (req.headers['x-request-id'] as string) || '';
    const result = await this.groupService.expireGroupBooking(id, requestId);
    return { result };
  }

  @Post('payments/capture')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async capturePayment(
    @Body() body: { provider_ref: string },
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (!body?.provider_ref) {
      throw new BadRequestException({
        code: 'MISSING_PROVIDER_REF',
        message: 'Must provide provider_ref',
      });
    }
    const principal = req.auth as SessionPrincipal;
    if (!principal?.userId) {
      throw new BadRequestException({
        code: 'AUTH_REQUIRED',
        message: 'Authentication is required.',
      });
    }
    // Sandbox-only shim: the PSP must report the capture and the caller must own
    // the intent claimed by the group booking. A real PSP capture reaches the
    // group through the signed webhook, never through a client request.
    await this.paymentsService.assertProviderCaptured(
      body.provider_ref,
      principal.userId,
    );
    const requestId = (req.headers['x-request-id'] as string) || '';
    const result = await this.groupService.handlePaymentCaptured(body.provider_ref, requestId);
    return { result };
  }

  // ---------------------------------------------------------------------------
  // ENG-303: Difference Summary & Pay-Difference Endpoints
  // ---------------------------------------------------------------------------

  @Get(':id/difference-summary')
  @UseGuards(SessionGuard)
  async getDifferenceSummary(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const summary = await this.groupService.getDifferenceSummary(principal.userId, id);
    return { difference_summary: summary };
  }

  @Post(':id/pay-difference')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  async payDifference(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const principal = req.auth as SessionPrincipal;
    const requestId = (req.headers['x-request-id'] as string) || '';
    const paymentIntent = await this.groupService.payDifference(principal.userId, id, requestId);
    return { payment_intent: paymentIntent };
  }
}
