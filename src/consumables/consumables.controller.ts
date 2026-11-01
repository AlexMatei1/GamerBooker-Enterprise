import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { SessionPrincipal } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';
import { RequireVenueRole, VenueRoleGuard } from '../auth/venue-role.guard';
import { ConsumablesService } from './consumables.service';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateProductInput,
  UpdateProductInput,
  AdjustStockInput,
  BulkImportProductsInput,
  UploadImageInput,
  PerformStockReconciliationInput,
} from './consumables.types';

interface AuthedRequest extends Request {
  auth?: SessionPrincipal;
}

@Controller()
export class ConsumablesController {
  constructor(private readonly consumablesService: ConsumablesService) {}

  // ===========================================================================
  // Public Menu Endpoints (/v1/venues/:venue_id/menu)
  // ===========================================================================

  @Get('venues/:venue_id/menu/categories')
  async getPublicCategories(@Param('venue_id') venueId: string) {
    return this.consumablesService.listCategories(venueId, true);
  }

  @Get('venues/:venue_id/menu/products')
  async getPublicProducts(
    @Param('venue_id') venueId: string,
    @Query('category_id') categoryId?: string,
    @Query('search') search?: string,
  ) {
    return this.consumablesService.listProducts(venueId, {
      category_id: categoryId,
      active_only: true,
      search,
    });
  }

  @Get('venues/:venue_id/menu/products/:id')
  async getPublicProduct(
    @Param('venue_id') venueId: string,
    @Param('id') productId: string,
  ) {
    return this.consumablesService.getProductById(venueId, productId);
  }

  // ===========================================================================
  // Dashboard Menu Categories (/v1/dashboard/venues/:venue_id/menu/categories)
  // ===========================================================================

  @Get('dashboard/venues/:venue_id/menu/categories')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listDashboardCategories(@Param('venue_id') venueId: string) {
    return this.consumablesService.listCategories(venueId, false);
  }

  @Post('dashboard/venues/:venue_id/menu/categories')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async createCategory(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Body() input: CreateCategoryInput,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.consumablesService.createCategory(venueId, input, staffId);
  }

  @Patch('dashboard/venues/:venue_id/menu/categories/:id')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async updateCategory(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') categoryId: string,
    @Body() input: UpdateCategoryInput,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.consumablesService.updateCategory(venueId, categoryId, input, staffId);
  }

  @Delete('dashboard/venues/:venue_id/menu/categories/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async deleteCategory(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') categoryId: string,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.consumablesService.deleteCategory(venueId, categoryId, staffId);
  }

  // ===========================================================================
  // Dashboard Products (/v1/dashboard/venues/:venue_id/menu/products)
  // ===========================================================================

  @Get('dashboard/venues/:venue_id/menu/products')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listDashboardProducts(
    @Param('venue_id') venueId: string,
    @Query('category_id') categoryId?: string,
    @Query('search') search?: string,
  ) {
    return this.consumablesService.listProducts(venueId, {
      category_id: categoryId,
      active_only: false,
      search,
    });
  }

  @Get('dashboard/venues/:venue_id/menu/products/:id')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getDashboardProduct(
    @Param('venue_id') venueId: string,
    @Param('id') productId: string,
  ) {
    return this.consumablesService.getProductById(venueId, productId);
  }

  @Post('dashboard/venues/:venue_id/menu/products')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async createProduct(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Body() input: CreateProductInput,
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
    const staffRole = roleRes.rows[0]?.role || 'VENUE_MANAGER';

    return this.consumablesService.createProduct(venueId, input, staffId, staffRole, requestId);
  }

  @Patch('dashboard/venues/:venue_id/menu/products/:id')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async updateProduct(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') productId: string,
    @Body() input: UpdateProductInput,
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
    const staffRole = roleRes.rows[0]?.role || 'VENUE_MANAGER';

    return this.consumablesService.updateProduct(venueId, productId, input, staffId, staffRole, requestId);
  }

  @Delete('dashboard/venues/:venue_id/menu/products/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async deleteProduct(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') productId: string,
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
    const staffRole = roleRes.rows[0]?.role || 'VENUE_MANAGER';

    return this.consumablesService.deleteProduct(venueId, productId, staffId, staffRole);
  }

  // ===========================================================================
  // Stock Adjustment & Audit History
  // ===========================================================================

  @Post('dashboard/venues/:venue_id/menu/products/:id/adjust-stock')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async adjustStock(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Param('id') productId: string,
    @Body() input: AdjustStockInput,
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
    const staffRole = roleRes.rows[0]?.role || 'VENUE_MANAGER';

    return this.consumablesService.adjustStock(venueId, productId, input, staffId, staffRole, requestId);
  }

  @Get('dashboard/venues/:venue_id/menu/products/:id/stock-history')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getStockHistory(
    @Param('venue_id') venueId: string,
    @Param('id') productId: string,
  ) {
    return this.consumablesService.getStockHistory(venueId, productId);
  }

  // ===========================================================================
  // Bulk Import & Image Assets
  // ===========================================================================

  @Post('dashboard/venues/:venue_id/menu/products/bulk-import')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async bulkImport(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Body() input: BulkImportProductsInput,
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
    const staffRole = roleRes.rows[0]?.role || 'VENUE_MANAGER';

    return this.consumablesService.bulkImport(venueId, input, staffId, staffRole, requestId);
  }

  @Post('dashboard/venues/:venue_id/menu/products/upload-image')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async uploadImage(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Body() input: UploadImageInput,
  ) {
    const staffId = req.auth?.userId;
    if (!staffId) {
      throw new Error('AUTH_REQUIRED');
    }
    return this.consumablesService.registerImage(venueId, input, staffId);
  }

  // ===========================================================================
  // ENG-404: Physical Stock Reconciliation
  // ===========================================================================

  @Post('dashboard/venues/:venue_id/menu/stock-reconciliation')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER')
  async performStockReconciliation(
    @Req() req: AuthedRequest,
    @Param('venue_id') venueId: string,
    @Body() input: PerformStockReconciliationInput,
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
    const staffRole = roleRes.rows[0]?.role || 'VENUE_MANAGER';

    return this.consumablesService.performStockReconciliation(
      venueId,
      staffId,
      staffRole,
      input,
      requestId,
    );
  }

  @Get('dashboard/venues/:venue_id/menu/stock-reconciliation')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async listStockReconciliations(
    @Param('venue_id') venueId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.consumablesService.listStockReconciliations(venueId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('dashboard/venues/:venue_id/menu/stock-reconciliation/:id')
  @UseGuards(SessionGuard, VenueRoleGuard)
  @RequireVenueRole('OWNER', 'VENUE_MANAGER', 'RECEPTION')
  async getStockReconciliationById(
    @Param('venue_id') venueId: string,
    @Param('id') auditId: string,
  ) {
    return this.consumablesService.getStockReconciliationById(venueId, auditId);
  }
}
