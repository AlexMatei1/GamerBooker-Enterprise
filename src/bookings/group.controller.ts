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
import type { CreateGroupBookingDto, AdjustSharesDto } from './group.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller('group-bookings')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

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
}
