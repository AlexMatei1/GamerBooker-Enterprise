import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';
import { RequireVenueRole, VenueRoleGuard } from '../auth/venue-role.guard';
import { OrdersService } from './orders.service';
import type {
  ValidateCartInput,
  CheckoutOrderInput,
  OrderFilterQuery,
} from './orders.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ===========================================================================
  // Customer Cart & Checkout Endpoints (/v1/orders)
  // ===========================================================================

  @Post('orders/cart/validate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async validateCart(
    @Req() req: AuthedRequest,
    @Body() input: ValidateCartInput,
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.ordersService.validateCart(customerId, input);
  }

  @Post('orders/checkout')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  async checkoutOrder(
    @Req() req: AuthedRequest,
    @Body() input: CheckoutOrderInput,
    @Headers('x-request-id') requestId?: string,
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.ordersService.checkoutOrder(customerId, input, requestId);
  }

  @Post('orders/payments/capture')
  @HttpCode(HttpStatus.OK)
  async captureOrderPayment(
    @Body() body: { provider_ref: string },
    @Headers('x-request-id') requestId?: string,
  ) {
    if (!body?.provider_ref) {
      throw new Error('MISSING_PROVIDER_REF');
    }
    return this.ordersService.handleOrderPaymentCaptured(body.provider_ref, requestId);
  }

  @Get('orders')
  @UseGuards(SessionGuard)
  async listMyOrders(
    @Req() req: AuthedRequest,
    @Query('booking_id') bookingId?: string,
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.ordersService.listCustomerOrders(customerId, bookingId);
  }

  @Get('orders/:id')
  @UseGuards(SessionGuard)
  async getMyOrder(
    @Req() req: AuthedRequest,
    @Param('id') orderId: string,
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.ordersService.getOrderById(orderId, customerId);
  }

  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async cancelMyOrder(
    @Req() req: AuthedRequest,
    @Param('id') orderId: string,
    @Body() body?: { reason?: string },
    @Headers('x-request-id') requestId?: string,
  ) {
    const customerId = req.auth?.userId;
    if (!customerId) {
      throw new Error('AUTH_REQUIRED');
    }
    const order = await this.ordersService.getOrderById(orderId, customerId);
    return this.ordersService.cancelOrder(
      order.venue_id,
      orderId,
      customerId,
      'CUSTOMER',
      body?.reason || 'Customer cancelled order',
      requestId,
    );
  }

  // ===========================================================================
  // Dashboard Venue Orders (/v1/dashboard/venues/:venue_id/orders)
  // ===========================================================================

  @Get('dashboard/venues/:venue_id/orders')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listDashboardOrders(
    @Param('venue_id') venueId: string,
    @Query() query: OrderFilterQuery,
  ) {
    return this.ordersService.listOrders(venueId, query);
  }

  @Get('dashboard/venues/:venue_id/orders/:id')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getDashboardOrder(
    @Param('venue_id') venueId: string,
    @Param('id') orderId: string,
  ) {
    return this.ordersService.getOrderById(orderId, undefined, venueId);
  }

  @Post('dashboard/venues/:venue_id/orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async cancelDashboardOrder(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') orderId: string,
    @Body() body?: { reason?: string },
    @Headers('x-request-id') requestId?: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    const pool = (await import('../db/pool')).getPool();
    const roleRes = await pool.query<{ role: string }>(
      'SELECT role FROM venue_memberships WHERE venue_id = $1 AND user_id = $2',
      [venueId, staffId],
    );
    const staffRole = roleRes.rows[0]?.role || 'RECEPTION';

    return this.ordersService.cancelOrder(
      venueId,
      orderId,
      staffId,
      staffRole,
      body?.reason || 'Staff cancellation',
      requestId,
    );
  }

  // ===========================================================================
  // ENG-403: Bar Board Queue & State Machine Mutations
  // ===========================================================================

  @Get('dashboard/venues/:venue_id/bar-board')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getBarBoard(
    @Param('venue_id') venueId: string,
    @Query('fulfillment_mode') fulfillmentMode?: any,
    @Query('status') status?: any,
  ) {
    return this.ordersService.getBarBoard(venueId, {
      fulfillment_mode: fulfillmentMode,
      status,
    });
  }

  @Post('dashboard/venues/:venue_id/orders/:id/accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async acceptOrder(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') orderId: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    const pool = (await import('../db/pool')).getPool();
    const roleRes = await pool.query<{ role: string }>(
      'SELECT role FROM venue_memberships WHERE venue_id = $1 AND user_id = $2',
      [venueId, staffId],
    );
    const staffRole = roleRes.rows[0]?.role || 'RECEPTION';

    return this.ordersService.acceptOrder(venueId, orderId, staffId, staffRole, requestId);
  }

  @Post('dashboard/venues/:venue_id/orders/:id/prepare')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async prepareOrder(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') orderId: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    const pool = (await import('../db/pool')).getPool();
    const roleRes = await pool.query<{ role: string }>(
      'SELECT role FROM venue_memberships WHERE venue_id = $1 AND user_id = $2',
      [venueId, staffId],
    );
    const staffRole = roleRes.rows[0]?.role || 'RECEPTION';

    return this.ordersService.prepareOrder(venueId, orderId, staffId, staffRole, requestId);
  }

  @Post('dashboard/venues/:venue_id/orders/:id/ready')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async markOrderReady(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') orderId: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    const pool = (await import('../db/pool')).getPool();
    const roleRes = await pool.query<{ role: string }>(
      'SELECT role FROM venue_memberships WHERE venue_id = $1 AND user_id = $2',
      [venueId, staffId],
    );
    const staffRole = roleRes.rows[0]?.role || 'RECEPTION';

    return this.ordersService.markOrderReady(venueId, orderId, staffId, staffRole, requestId);
  }

  @Post('dashboard/venues/:venue_id/orders/:id/handoff')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async handoffOrder(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') orderId: string,
    @Body() body?: { pickup_code?: string; age_verified?: boolean },
    @Headers('x-request-id') requestId?: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    const pool = (await import('../db/pool')).getPool();
    const roleRes = await pool.query<{ role: string }>(
      'SELECT role FROM venue_memberships WHERE venue_id = $1 AND user_id = $2',
      [venueId, staffId],
    );
    const staffRole = roleRes.rows[0]?.role || 'RECEPTION';

    return this.ordersService.handoffOrder(venueId, orderId, staffId, staffRole, body, requestId);
  }

  @Post('dashboard/venues/:venue_id/orders/:id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async rejectOrder(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') orderId: string,
    @Body() body: { reason: string },
    @Headers('x-request-id') requestId?: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    const pool = (await import('../db/pool')).getPool();
    const roleRes = await pool.query<{ role: string }>(
      'SELECT role FROM venue_memberships WHERE venue_id = $1 AND user_id = $2',
      [venueId, staffId],
    );
    const staffRole = roleRes.rows[0]?.role || 'RECEPTION';

    return this.ordersService.rejectOrder(venueId, orderId, staffId, staffRole, body, requestId);
  }
}
