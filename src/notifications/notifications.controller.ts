import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';
import { AuthHttpError } from '../auth/auth-error';
import { NotificationsService } from './notifications.service';
import {
  DispatchNotificationInput,
  UpdateNotificationPreferenceInput,
} from './notifications.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @UseGuards(SessionGuard)
  async listNotifications(
    @Req() req: AuthedRequest,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('unread_only') unreadOnly?: string,
  ) {
    const userId = req.auth?.userId;
    if (!userId) {
      throw new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', 'Authentication required.');
    }
    return this.notificationsService.listNotifications(userId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      unread_only: unreadOnly === 'true',
    });
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async markRead(@Req() req: AuthedRequest, @Param('id') id: string) {
    const userId = req.auth?.userId;
    if (!userId) {
      throw new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', 'Authentication required.');
    }
    return this.notificationsService.markAsRead(userId, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async markAllRead(@Req() req: AuthedRequest) {
    const userId = req.auth?.userId;
    if (!userId) {
      throw new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', 'Authentication required.');
    }
    return this.notificationsService.markAllAsRead(userId);
  }

  @Get('preferences')
  @UseGuards(SessionGuard)
  async getPreferences(@Req() req: AuthedRequest) {
    const userId = req.auth?.userId;
    if (!userId) {
      throw new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', 'Authentication required.');
    }
    return this.notificationsService.getPreferences(userId);
  }

  @Put('preferences')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async updatePreferences(
    @Req() req: AuthedRequest,
    @Body() input: UpdateNotificationPreferenceInput,
  ) {
    const userId = req.auth?.userId;
    if (!userId) {
      throw new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', 'Authentication required.');
    }
    return this.notificationsService.updatePreferences(userId, input);
  }

  @Post('dispatch')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async dispatch(@Req() req: AuthedRequest, @Body() input: DispatchNotificationInput) {
    const userId = req.auth?.userId;
    if (!userId) {
      throw new AuthHttpError(HttpStatus.UNAUTHORIZED, 'AUTH_REQUIRED', 'Authentication required.');
    }
    return this.notificationsService.dispatch(input);
  }
}
