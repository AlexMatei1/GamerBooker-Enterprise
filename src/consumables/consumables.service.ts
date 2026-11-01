import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getPool } from '../db/pool';
import { AuthHttpError } from '../auth/auth-error';
import type {
  MenuCategory,
  CreateCategoryInput,
  UpdateCategoryInput,
  ProductItem,
  CreateProductInput,
  UpdateProductInput,
  AdjustStockInput,
  StockMovementItem,
  BulkImportProductsInput,
  BulkImportResult,
  UploadImageInput,
  RestrictedProductType,
  PerformStockReconciliationInput,
  StockReconciliationAuditDetail,
  StockReconciliationItemDetail,
  StockReconciliationListResult,
} from './consumables.types';

@Injectable()
export class ConsumablesService {
  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------

  async listCategories(venueId: string, onlyActive?: boolean): Promise<MenuCategory[]> {
    const pool = getPool();
    const query = onlyActive
      ? 'SELECT * FROM menu_categories WHERE venue_id = $1 AND active = true ORDER BY sort_order ASC, name ASC'
      : 'SELECT * FROM menu_categories WHERE venue_id = $1 ORDER BY sort_order ASC, name ASC';

    const res = await pool.query<any>(query, [venueId]);
    return res.rows.map((r) => this.mapCategory(r));
  }

  async createCategory(
    venueId: string,
    input: CreateCategoryInput,
    staffId: string,
  ): Promise<MenuCategory> {
    const pool = getPool();
    if (!input.name || input.name.trim().length === 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'MISSING_CATEGORY_NAME',
        'Category name is required.',
      );
    }

    const vRes = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM venues WHERE id = $1',
      [venueId],
    );
    if (vRes.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'VENUE_NOT_FOUND', 'Venue not found.');
    }
    const tenantId = vRes.rows[0].tenant_id;

    // Check unique name per venue
    const dupRes = await pool.query(
      'SELECT id FROM menu_categories WHERE venue_id = $1 AND lower(name) = lower($2)',
      [venueId, input.name.trim()],
    );
    if (dupRes.rows.length > 0) {
      throw new AuthHttpError(
        HttpStatus.CONFLICT,
        'CATEGORY_NAME_EXISTS',
        `A category named '${input.name.trim()}' already exists for this venue.`,
      );
    }

    const inserted = await pool.query<any>(
      `INSERT INTO menu_categories (
         tenant_id, venue_id, name, description, sort_order, active
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        tenantId,
        venueId,
        input.name.trim(),
        input.description || null,
        input.sort_order ?? 0,
        input.active ?? true,
      ],
    );

    return this.mapCategory(inserted.rows[0]);
  }

  async updateCategory(
    venueId: string,
    categoryId: string,
    input: UpdateCategoryInput,
    staffId: string,
  ): Promise<MenuCategory> {
    const pool = getPool();
    const existingRes = await pool.query<any>(
      'SELECT * FROM menu_categories WHERE id = $1 AND venue_id = $2',
      [categoryId, venueId],
    );
    if (existingRes.rows.length === 0) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'CATEGORY_NOT_FOUND',
        'Menu category not found.',
      );
    }

    if (input.name && input.name.trim().length > 0) {
      const dup = await pool.query(
        'SELECT id FROM menu_categories WHERE venue_id = $1 AND lower(name) = lower($2) AND id != $3',
        [venueId, input.name.trim(), categoryId],
      );
      if (dup.rows.length > 0) {
        throw new AuthHttpError(
          HttpStatus.CONFLICT,
          'CATEGORY_NAME_EXISTS',
          `A category named '${input.name.trim()}' already exists.`,
        );
      }
    }

    const updatedRes = await pool.query<any>(
      `UPDATE menu_categories
          SET name = COALESCE($1, name),
              description = COALESCE($2, description),
              sort_order = COALESCE($3, sort_order),
              active = COALESCE($4, active),
              updated_at = now()
        WHERE id = $5 AND venue_id = $6
        RETURNING *`,
      [
        input.name?.trim() || null,
        input.description !== undefined ? input.description : null,
        input.sort_order !== undefined ? input.sort_order : null,
        input.active !== undefined ? input.active : null,
        categoryId,
        venueId,
      ],
    );

    return this.mapCategory(updatedRes.rows[0]);
  }

  async deleteCategory(
    venueId: string,
    categoryId: string,
    staffId: string,
  ): Promise<{ deleted: boolean }> {
    const pool = getPool();
    const res = await pool.query(
      'DELETE FROM menu_categories WHERE id = $1 AND venue_id = $2',
      [categoryId, venueId],
    );
    if (res.rowCount === 0) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'CATEGORY_NOT_FOUND',
        'Menu category not found.',
      );
    }
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------

  async listProducts(
    venueId: string,
    filter?: { category_id?: string; active_only?: boolean; search?: string },
  ): Promise<ProductItem[]> {
    const pool = getPool();
    const conditions: string[] = ['p.venue_id = $1'];
    const params: any[] = [venueId];
    let pIdx = 2;

    if (filter?.active_only) {
      conditions.push('p.active = true');
    }
    if (filter?.category_id) {
      conditions.push(`p.category_id = $${pIdx++}`);
      params.push(filter.category_id);
    }
    if (filter?.search) {
      conditions.push(`(p.title ILIKE $${pIdx} OR p.sku ILIKE $${pIdx})`);
      params.push(`%${filter.search}%`);
      pIdx++;
    }

    const whereClause = conditions.join(' AND ');
    const query = `
      SELECT p.*, c.name as category_name
        FROM products p
        LEFT JOIN menu_categories c ON c.id = p.category_id
       WHERE ${whereClause}
       ORDER BY p.title ASC
    `;

    const res = await pool.query<any>(query, params);
    return res.rows.map((r) => this.mapProduct(r));
  }

  async getProductById(venueId: string, productId: string): Promise<ProductItem> {
    const pool = getPool();
    const res = await pool.query<any>(
      `SELECT p.*, c.name as category_name
         FROM products p
         LEFT JOIN menu_categories c ON c.id = p.category_id
        WHERE p.id = $1 AND p.venue_id = $2`,
      [productId, venueId],
    );
    if (res.rows.length === 0) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'PRODUCT_NOT_FOUND',
        'Product not found.',
      );
    }
    return this.mapProduct(res.rows[0]);
  }

  async createProduct(
    venueId: string,
    input: CreateProductInput,
    staffId: string,
    staffRole: string,
    requestId?: string,
  ): Promise<ProductItem> {
    const pool = getPool();
    const reqId = requestId || randomUUID();

    if (!input.title || input.title.trim().length === 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'MISSING_PRODUCT_TITLE',
        'Product title is required.',
      );
    }

    if (!input.price_minor || input.price_minor <= 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_PRODUCT_PRICE',
        'Product price must be a positive integer in minor units.',
      );
    }

    // Auto-enforce age verification requirement for restricted categories (Legea 42/2024 compliance)
    const restrictedType: RestrictedProductType = input.restricted_product_type || 'NONE';
    const ageRequired =
      restrictedType === 'ENERGY_DRINK' || restrictedType === 'ALCOHOL'
        ? true
        : Boolean(input.age_verification_required);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const vRes = await client.query<{ tenant_id: string }>(
        'SELECT tenant_id FROM venues WHERE id = $1',
        [venueId],
      );
      if (vRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'VENUE_NOT_FOUND', 'Venue not found.');
      }
      const tenantId = vRes.rows[0].tenant_id;

      // Check SKU uniqueness within venue
      if (input.sku && input.sku.trim().length > 0) {
        const skuCheck = await client.query(
          'SELECT id FROM products WHERE venue_id = $1 AND lower(sku) = lower($2)',
          [venueId, input.sku.trim()],
        );
        if (skuCheck.rows.length > 0) {
          throw new AuthHttpError(
            HttpStatus.CONFLICT,
            'SKU_ALREADY_EXISTS',
            `Product SKU '${input.sku.trim()}' already exists in this venue.`,
          );
        }
      }

      // Verify category belongs to venue if provided
      if (input.category_id) {
        const catCheck = await client.query(
          'SELECT id FROM menu_categories WHERE id = $1 AND venue_id = $2',
          [input.category_id, venueId],
        );
        if (catCheck.rows.length === 0) {
          throw new AuthHttpError(
            HttpStatus.BAD_REQUEST,
            'INVALID_CATEGORY',
            'Specified category does not exist for this venue.',
          );
        }
      }

      const initialStock = Math.max(input.initial_stock || 0, 0);
      const tracking = input.inventory_tracking ?? (initialStock > 0);

      const inserted = await client.query<any>(
        `INSERT INTO products (
           tenant_id, venue_id, category_id, sku, title, description, image_url,
           price_minor, currency, tax_category, active, inventory_tracking,
           stock_on_hand, stock_reserved, min_qty, max_qty, preparation_minutes,
           fulfillment_methods, restricted_product_type, age_verification_required
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, $14, $15, $16, $17, $18, $19
         ) RETURNING *`,
        [
          tenantId,
          venueId,
          input.category_id || null,
          input.sku?.trim() || null,
          input.title.trim(),
          input.description || null,
          input.image_url || null,
          input.price_minor,
          input.currency || 'RON',
          input.tax_category || 'STANDARD',
          input.active ?? true,
          tracking,
          initialStock,
          input.min_qty || 1,
          input.max_qty || 10,
          input.preparation_minutes || 0,
          input.fulfillment_methods || ['AT_STATION', 'BAR_PICKUP'],
          restrictedType,
          ageRequired,
        ],
      );

      const product = inserted.rows[0];

      // Record stock movement if initial stock provided
      if (initialStock > 0) {
        await client.query(
          `INSERT INTO stock_movements (
             tenant_id, venue_id, product_id, movement_type, quantity_delta,
             balance_after, actor_id, actor_role, notes
           ) VALUES ($1, $2, $3, 'INITIAL_STOCK', $4, $4, $5, $6, 'Initial inventory setup')`,
          [tenantId, venueId, product.id, initialStock, staffId, staffRole],
        );
      }

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'PRODUCT_CREATED', 'PRODUCT', $6, $7)`,
        [
          tenantId,
          venueId,
          reqId,
          staffId,
          staffRole,
          product.id,
          JSON.stringify({ title: product.title, price_minor: product.price_minor }),
        ],
      );

      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         ) VALUES ($1, 'PRODUCT', $2, 'ProductCreated', $3)`,
        [
          tenantId,
          product.id,
          JSON.stringify({ product_id: product.id, title: product.title }),
        ],
      );

      await client.query('COMMIT');
      return this.mapProduct(product);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async updateProduct(
    venueId: string,
    productId: string,
    input: UpdateProductInput,
    staffId: string,
    staffRole: string,
    requestId?: string,
  ): Promise<ProductItem> {
    const pool = getPool();
    const reqId = requestId || randomUUID();

    if (input.price_minor !== undefined && input.price_minor <= 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_PRODUCT_PRICE',
        'Product price must be a positive integer in minor units.',
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const pRes = await client.query<any>(
        'SELECT * FROM products WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [productId, venueId],
      );
      if (pRes.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'PRODUCT_NOT_FOUND',
          'Product not found.',
        );
      }
      const existing = pRes.rows[0];

      // Check SKU uniqueness if changed
      if (input.sku && input.sku.trim().length > 0) {
        const skuCheck = await client.query(
          'SELECT id FROM products WHERE venue_id = $1 AND lower(sku) = lower($2) AND id != $3',
          [venueId, input.sku.trim(), productId],
        );
        if (skuCheck.rows.length > 0) {
          throw new AuthHttpError(
            HttpStatus.CONFLICT,
            'SKU_ALREADY_EXISTS',
            `Product SKU '${input.sku.trim()}' already exists.`,
          );
        }
      }

      // Check category
      if (input.category_id) {
        const catCheck = await client.query(
          'SELECT id FROM menu_categories WHERE id = $1 AND venue_id = $2',
          [input.category_id, venueId],
        );
        if (catCheck.rows.length === 0) {
          throw new AuthHttpError(
            HttpStatus.BAD_REQUEST,
            'INVALID_CATEGORY',
            'Category does not exist.',
          );
        }
      }

      const restrictedType = input.restricted_product_type || existing.restricted_product_type;
      const ageRequired =
        restrictedType === 'ENERGY_DRINK' || restrictedType === 'ALCOHOL'
          ? true
          : input.age_verification_required !== undefined
          ? input.age_verification_required
          : existing.age_verification_required;

      const setClauses: string[] = ['updated_at = now()'];
      const params: any[] = [];
      let pIdx = 1;

      if (input.category_id !== undefined) {
        if (input.category_id === null) {
          setClauses.push('category_id = NULL');
        } else {
          setClauses.push(`category_id = $${pIdx++}`);
          params.push(input.category_id);
        }
      }
      if (input.sku !== undefined) {
        setClauses.push(`sku = $${pIdx++}`);
        params.push(input.sku?.trim() || null);
      }
      if (input.title !== undefined) {
        setClauses.push(`title = $${pIdx++}`);
        params.push(input.title.trim());
      }
      if (input.description !== undefined) {
        setClauses.push(`description = $${pIdx++}`);
        params.push(input.description);
      }
      if (input.image_url !== undefined) {
        setClauses.push(`image_url = $${pIdx++}`);
        params.push(input.image_url);
      }
      if (input.price_minor !== undefined) {
        setClauses.push(`price_minor = $${pIdx++}`);
        params.push(input.price_minor);
      }
      if (input.currency !== undefined) {
        setClauses.push(`currency = $${pIdx++}`);
        params.push(input.currency);
      }
      if (input.tax_category !== undefined) {
        setClauses.push(`tax_category = $${pIdx++}`);
        params.push(input.tax_category);
      }
      if (input.active !== undefined) {
        setClauses.push(`active = $${pIdx++}`);
        params.push(input.active);
      }
      if (input.inventory_tracking !== undefined) {
        setClauses.push(`inventory_tracking = $${pIdx++}`);
        params.push(input.inventory_tracking);
      }
      if (input.min_qty !== undefined) {
        setClauses.push(`min_qty = $${pIdx++}`);
        params.push(input.min_qty);
      }
      if (input.max_qty !== undefined) {
        setClauses.push(`max_qty = $${pIdx++}`);
        params.push(input.max_qty);
      }
      if (input.preparation_minutes !== undefined) {
        setClauses.push(`preparation_minutes = $${pIdx++}`);
        params.push(input.preparation_minutes);
      }
      if (input.fulfillment_methods !== undefined) {
        setClauses.push(`fulfillment_methods = $${pIdx++}`);
        params.push(input.fulfillment_methods);
      }
      if (input.restricted_product_type !== undefined) {
        setClauses.push(`restricted_product_type = $${pIdx++}`);
        params.push(input.restricted_product_type);
      }
      if (
        input.age_verification_required !== undefined ||
        restrictedType !== existing.restricted_product_type
      ) {
        setClauses.push(`age_verification_required = $${pIdx++}`);
        params.push(ageRequired);
      }

      params.push(productId);
      const prodIdParam = pIdx++;
      params.push(venueId);
      const venueIdParam = pIdx++;

      const updateQuery = `
        UPDATE products
           SET ${setClauses.join(', ')}
         WHERE id = $${prodIdParam} AND venue_id = $${venueIdParam}
         RETURNING *
      `;
      const updatedRes = await client.query<any>(updateQuery, params);

      const product = updatedRes.rows[0];

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'PRODUCT_UPDATED', 'PRODUCT', $6, $7)`,
        [
          existing.tenant_id,
          venueId,
          reqId,
          staffId,
          staffRole,
          productId,
          JSON.stringify({ changes: input }),
        ],
      );

      await client.query('COMMIT');
      return this.mapProduct(product);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteProduct(
    venueId: string,
    productId: string,
    staffId: string,
    staffRole: string,
  ): Promise<{ deleted: boolean }> {
    const pool = getPool();
    // Soft-archive by marking active = false
    const res = await pool.query(
      'UPDATE products SET active = false, updated_at = now() WHERE id = $1 AND venue_id = $2',
      [productId, venueId],
    );
    if (res.rowCount === 0) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'PRODUCT_NOT_FOUND',
        'Product not found.',
      );
    }
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Stock Tracking & Movements
  // ---------------------------------------------------------------------------

  async adjustStock(
    venueId: string,
    productId: string,
    input: AdjustStockInput,
    staffId: string,
    staffRole: string,
    requestId?: string,
  ): Promise<ProductItem> {
    const pool = getPool();
    const reqId = requestId || randomUUID();

    if (!input.quantity_delta || input.quantity_delta === 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'INVALID_STOCK_DELTA',
        'Quantity delta must be a non-zero integer.',
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const pRes = await client.query<any>(
        'SELECT * FROM products WHERE id = $1 AND venue_id = $2 FOR UPDATE',
        [productId, venueId],
      );
      if (pRes.rows.length === 0) {
        throw new AuthHttpError(
          HttpStatus.NOT_FOUND,
          'PRODUCT_NOT_FOUND',
          'Product not found.',
        );
      }
      const product = pRes.rows[0];

      const currentOnHand = Number(product.stock_on_hand);
      const reserved = Number(product.stock_reserved);
      const newOnHand = currentOnHand + input.quantity_delta;

      if (newOnHand < 0) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'STOCK_CANNOT_BE_NEGATIVE',
          `Cannot reduce stock by ${Math.abs(input.quantity_delta)}. Current on-hand is ${currentOnHand}.`,
        );
      }

      if (newOnHand < reserved) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INSUFFICIENT_STOCK_FOR_ADJUSTMENT',
          `Cannot reduce stock below reserved quantity (${reserved}). New on-hand would be ${newOnHand}.`,
        );
      }

      await client.query(
        'UPDATE products SET stock_on_hand = $1, inventory_tracking = true, updated_at = now() WHERE id = $2',
        [newOnHand, productId],
      );

      await client.query(
        `INSERT INTO stock_movements (
           tenant_id, venue_id, product_id, movement_type, quantity_delta,
           balance_after, actor_id, actor_role, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          product.tenant_id,
          venueId,
          productId,
          input.movement_type,
          input.quantity_delta,
          newOnHand,
          staffId,
          staffRole,
          input.notes || null,
        ],
      );

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'STOCK_ADJUSTED', 'PRODUCT', $6, $7)`,
        [
          product.tenant_id,
          venueId,
          reqId,
          staffId,
          staffRole,
          productId,
          JSON.stringify({
            delta: input.quantity_delta,
            balance_after: newOnHand,
            movement_type: input.movement_type,
          }),
        ],
      );

      await client.query('COMMIT');

      return this.getProductById(venueId, productId);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async getStockHistory(venueId: string, productId: string): Promise<StockMovementItem[]> {
    const pool = getPool();
    // Validate product exists
    await this.getProductById(venueId, productId);

    const res = await pool.query<any>(
      `SELECT * FROM stock_movements
        WHERE product_id = $1 AND venue_id = $2
        ORDER BY created_at DESC`,
      [productId, venueId],
    );

    return res.rows.map((r) => ({
      id: r.id,
      product_id: r.product_id,
      movement_type: r.movement_type,
      quantity_delta: Number(r.quantity_delta),
      balance_after: Number(r.balance_after),
      actor_id: r.actor_id || null,
      actor_role: r.actor_role || null,
      reference: r.reference || null,
      notes: r.notes || null,
      created_at: new Date(r.created_at).toISOString(),
    }));
  }

  // ---------------------------------------------------------------------------
  // Bulk Import
  // ---------------------------------------------------------------------------

  async bulkImport(
    venueId: string,
    input: BulkImportProductsInput,
    staffId: string,
    staffRole: string,
    requestId?: string,
  ): Promise<BulkImportResult> {
    const pool = getPool();
    const reqId = requestId || randomUUID();
    const errors: Array<{ index: number; sku?: string; error: string }> = [];
    const seenSkus = new Set<string>();

    const vRes = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM venues WHERE id = $1',
      [venueId],
    );
    if (vRes.rows.length === 0) {
      throw new AuthHttpError(HttpStatus.NOT_FOUND, 'VENUE_NOT_FOUND', 'Venue not found.');
    }
    const tenantId = vRes.rows[0].tenant_id;

    // Pre-validation pass
    for (let i = 0; i < input.products.length; i++) {
      const p = input.products[i];
      if (!p.title || p.title.trim().length === 0) {
        errors.push({ index: i, sku: p.sku, error: 'Product title is required' });
      }
      if (!p.price_minor || p.price_minor <= 0) {
        errors.push({ index: i, sku: p.sku, error: 'Product price must be positive minor units' });
      }
      if (p.sku) {
        const lowerSku = p.sku.trim().toLowerCase();
        if (seenSkus.has(lowerSku)) {
          errors.push({ index: i, sku: p.sku, error: `Duplicate SKU '${p.sku}' in import batch` });
        }
        seenSkus.add(lowerSku);
      }
    }

    // Check DB conflicts for SKUs
    if (seenSkus.size > 0) {
      const existingRes = await pool.query<{ sku: string }>(
        'SELECT sku FROM products WHERE venue_id = $1 AND lower(sku) = ANY($2)',
        [venueId, Array.from(seenSkus)],
      );
      for (const row of existingRes.rows) {
        const idx = input.products.findIndex(
          (p) => p.sku && p.sku.trim().toLowerCase() === row.sku.toLowerCase(),
        );
        errors.push({
          index: idx,
          sku: row.sku,
          error: `SKU '${row.sku}' already exists in venue catalog`,
        });
      }
    }

    if (input.dry_run || errors.length > 0) {
      return {
        imported_count: 0,
        dry_run: Boolean(input.dry_run),
        errors,
        products: [],
      };
    }

    // Apply batch import in a single transaction
    const client = await pool.connect();
    const createdProducts: ProductItem[] = [];

    try {
      await client.query('BEGIN');

      // Pre-fetch categories
      const catRes = await client.query<any>(
        'SELECT id, name FROM menu_categories WHERE venue_id = $1',
        [venueId],
      );
      const catMap = new Map<string, string>();
      for (const c of catRes.rows) {
        catMap.set(c.name.toLowerCase(), c.id);
      }

      for (const item of input.products) {
        let categoryId = item.category_id || null;
        if (!categoryId && item.category_name) {
          categoryId = catMap.get(item.category_name.toLowerCase()) || null;
          if (!categoryId) {
            // Auto-create category if missing
            const newCat = await client.query<any>(
              'INSERT INTO menu_categories (tenant_id, venue_id, name) VALUES ($1, $2, $3) RETURNING id',
              [tenantId, venueId, item.category_name.trim()],
            );
            categoryId = newCat.rows[0].id;
            catMap.set(item.category_name.toLowerCase(), categoryId!);
          }
        }

        const restrictedType: RestrictedProductType = item.restricted_product_type || 'NONE';
        const ageReq =
          restrictedType === 'ENERGY_DRINK' || restrictedType === 'ALCOHOL'
            ? true
            : Boolean(item.age_verification_required);
        const initialStock = Math.max(item.initial_stock || 0, 0);

        const insRes = await client.query<any>(
          `INSERT INTO products (
             tenant_id, venue_id, category_id, sku, title, description,
             price_minor, currency, tax_category, active, inventory_tracking,
             stock_on_hand, stock_reserved, min_qty, max_qty, preparation_minutes,
             fulfillment_methods, restricted_product_type, age_verification_required
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'RON', 'STANDARD', true, $8, $9, 0, 1, 10, 0, ARRAY['AT_STATION', 'BAR_PICKUP'], $10, $11)
           RETURNING *`,
          [
            tenantId,
            venueId,
            categoryId,
            item.sku?.trim() || null,
            item.title.trim(),
            item.description || null,
            item.price_minor,
            item.inventory_tracking ?? (initialStock > 0),
            initialStock,
            restrictedType,
            ageReq,
          ],
        );
        const product = insRes.rows[0];

        if (initialStock > 0) {
          await client.query(
            `INSERT INTO stock_movements (
               tenant_id, venue_id, product_id, movement_type, quantity_delta,
               balance_after, actor_id, actor_role, reference, notes
             ) VALUES ($1, $2, $3, 'INITIAL_STOCK', $4, $4, $5, $6, 'BULK_IMPORT', 'Bulk import setup')`,
            [tenantId, venueId, product.id, initialStock, staffId, staffRole],
          );
        }

        createdProducts.push(this.mapProduct(product));
      }

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'PRODUCTS_BULK_IMPORTED', 'VENUE', $2, $6)`,
        [
          tenantId,
          venueId,
          reqId,
          staffId,
          staffRole,
          JSON.stringify({ count: createdProducts.length }),
        ],
      );

      await client.query('COMMIT');

      return {
        imported_count: createdProducts.length,
        dry_run: false,
        errors: [],
        products: createdProducts,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Image Upload / Asset Registration
  // ---------------------------------------------------------------------------

  async registerImage(
    venueId: string,
    input: UploadImageInput,
    staffId: string,
  ): Promise<{ image_url: string }> {
    if (input.image_url) {
      if (!/^https?:\/\//i.test(input.image_url)) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_IMAGE_URL',
          'Image URL must be an absolute HTTP or HTTPS URL.',
        );
      }
      return { image_url: input.image_url };
    }

    if (input.image_base64) {
      const contentType = input.content_type || 'image/jpeg';
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(contentType)) {
        throw new AuthHttpError(
          HttpStatus.BAD_REQUEST,
          'INVALID_IMAGE_TYPE',
          `Content type '${contentType}' is not supported. Allowed: ${allowedTypes.join(', ')}`,
        );
      }
      const assetId = randomUUID();
      const ext = contentType.split('/')[1];
      const imageUrl = `https://assets.gamerbooker.com/venues/${venueId}/products/${assetId}.${ext}`;
      return { image_url: imageUrl };
    }

    throw new AuthHttpError(
      HttpStatus.BAD_REQUEST,
      'MISSING_IMAGE_PAYLOAD',
      'Either image_url or image_base64 must be provided.',
    );
  }

  // ---------------------------------------------------------------------------
  // ENG-404: Physical Stock Reconciliation
  // ---------------------------------------------------------------------------

  async performStockReconciliation(
    venueId: string,
    staffId: string,
    staffRole: string,
    input: PerformStockReconciliationInput,
    requestId?: string,
  ): Promise<StockReconciliationAuditDetail> {
    const pool = getPool();
    const reqId = requestId || randomUUID();

    if (!input?.items || !Array.isArray(input.items) || input.items.length === 0) {
      throw new AuthHttpError(
        HttpStatus.BAD_REQUEST,
        'MISSING_RECONCILIATION_ITEMS',
        'At least one product count must be submitted for stock reconciliation.',
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const vRes = await client.query<{ tenant_id: string }>(
        'SELECT tenant_id FROM venues WHERE id = $1',
        [venueId],
      );
      if (vRes.rows.length === 0) {
        throw new AuthHttpError(HttpStatus.NOT_FOUND, 'VENUE_NOT_FOUND', 'Venue not found.');
      }
      const tenantId = vRes.rows[0].tenant_id;

      // Create reconciliation audit record
      const auditRes = await client.query<any>(
        `INSERT INTO stock_reconciliation_audits (
           tenant_id, venue_id, performed_by, notes, status
         ) VALUES ($1, $2, $3, $4, 'IN_PROGRESS')
         RETURNING *`,
        [tenantId, venueId, staffId, input.notes?.trim() || null],
      );
      const audit = auditRes.rows[0];

      let itemsCounted = 0;
      let discrepancyItemsCount = 0;
      let totalDiscrepancyUnits = 0;
      let totalShrinkageValueMinor = 0n;

      const itemDetails: StockReconciliationItemDetail[] = [];

      for (const item of input.items) {
        if (!item.product_id) continue;
        const counted = Math.max(0, Math.floor(Number(item.counted_stock)));
        if (isNaN(counted)) {
          throw new AuthHttpError(
            HttpStatus.BAD_REQUEST,
            'INVALID_COUNTED_STOCK',
            `Counted stock for product '${item.product_id}' must be a non-negative integer.`,
          );
        }

        const pRes = await client.query<any>(
          'SELECT * FROM products WHERE id = $1 AND venue_id = $2 FOR UPDATE',
          [item.product_id, venueId],
        );
        if (pRes.rows.length === 0) {
          throw new AuthHttpError(
            HttpStatus.NOT_FOUND,
            'PRODUCT_NOT_FOUND',
            `Product '${item.product_id}' not found in this venue.`,
          );
        }
        const product = pRes.rows[0];
        const expectedOnHand = Number(product.stock_on_hand || 0);
        const priceMinor = BigInt(product.price_minor || 0);

        const discrepancyQty = counted - expectedOnHand;
        const discrepancyValueMinor = BigInt(Math.abs(discrepancyQty)) * priceMinor;

        let adjustmentType: 'NONE' | 'SHRINKAGE' | 'SURPLUS' = 'NONE';
        if (discrepancyQty < 0) {
          adjustmentType = 'SHRINKAGE';
        } else if (discrepancyQty > 0) {
          adjustmentType = 'SURPLUS';
        }

        itemsCounted++;
        if (discrepancyQty !== 0) {
          discrepancyItemsCount++;
          totalDiscrepancyUnits += discrepancyQty;
          if (discrepancyQty < 0) {
            totalShrinkageValueMinor += discrepancyValueMinor;
          }

          // Update product stock_on_hand to the verified counted stock
          await client.query(
            'UPDATE products SET stock_on_hand = $1, updated_at = now() WHERE id = $2',
            [counted, product.id],
          );

          // Record stock movement ledger entry
          const movementType = discrepancyQty < 0 ? 'DAMAGE_WASTE' : 'ADJUSTMENT';
          await client.query(
            `INSERT INTO stock_movements (
               tenant_id, venue_id, product_id, movement_type, quantity_delta,
               balance_after, actor_id, actor_role, reference, notes
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              tenantId,
              venueId,
              product.id,
              movementType,
              discrepancyQty,
              counted,
              staffId,
              staffRole,
              audit.id,
              `Physical stock reconciliation: ${adjustmentType} of ${Math.abs(discrepancyQty)} units`,
            ],
          );
        }

        // Record stock reconciliation item
        const itemRes = await client.query<any>(
          `INSERT INTO stock_reconciliation_items (
             audit_id, product_id, expected_stock, counted_stock,
             discrepancy_quantity, discrepancy_value_minor, adjustment_type, notes
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            audit.id,
            product.id,
            expectedOnHand,
            counted,
            discrepancyQty,
            discrepancyValueMinor.toString(),
            adjustmentType,
            item.notes || null,
          ],
        );

        itemDetails.push({
          id: itemRes.rows[0].id,
          product_id: product.id,
          product_title: product.title,
          expected_stock: expectedOnHand,
          counted_stock: counted,
          discrepancy_quantity: discrepancyQty,
          discrepancy_value_minor: Number(discrepancyValueMinor),
          adjustment_type: adjustmentType,
          notes: item.notes || null,
          created_at: new Date(itemRes.rows[0].created_at).toISOString(),
        });
      }

      // Update audit header with aggregated metrics
      await client.query(
        `UPDATE stock_reconciliation_audits
            SET items_counted = $1,
                discrepancy_items_count = $2,
                total_discrepancy_units = $3,
                total_shrinkage_value_minor = $4,
                status = 'COMPLETED',
                completed_at = now()
          WHERE id = $5`,
        [
          itemsCounted,
          discrepancyItemsCount,
          totalDiscrepancyUnits,
          totalShrinkageValueMinor.toString(),
          audit.id,
        ],
      );

      // Audit event
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, venue_id, request_id, actor_id, actor_role,
           action, target_type, target_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, 'STOCK_RECONCILIATION_COMPLETED', 'STOCK_RECONCILIATION', $6, $7)`,
        [
          tenantId,
          venueId,
          reqId,
          staffId,
          staffRole,
          audit.id,
          JSON.stringify({
            items_counted: itemsCounted,
            discrepancy_items_count: discrepancyItemsCount,
            total_discrepancy_units: totalDiscrepancyUnits,
            total_shrinkage_value_minor: totalShrinkageValueMinor.toString(),
          }),
        ],
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (
           tenant_id, aggregate_type, aggregate_id, event_type, payload
         ) VALUES ($1, 'STOCK_RECONCILIATION', $2, 'StockReconciliationCompleted', $3)`,
        [
          tenantId,
          audit.id,
          JSON.stringify({
            audit_id: audit.id,
            venue_id: venueId,
            items_counted: itemsCounted,
            discrepancy_items_count: discrepancyItemsCount,
          }),
        ],
      );

      await client.query('COMMIT');

      return {
        id: audit.id,
        tenant_id: tenantId,
        venue_id: venueId,
        performed_by: staffId,
        items_counted: itemsCounted,
        discrepancy_items_count: discrepancyItemsCount,
        total_discrepancy_units: totalDiscrepancyUnits,
        total_shrinkage_value_minor: Number(totalShrinkageValueMinor),
        notes: audit.notes,
        status: 'COMPLETED',
        items: itemDetails,
        created_at: new Date(audit.created_at).toISOString(),
        completed_at: new Date().toISOString(),
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async listStockReconciliations(
    venueId: string,
    filter?: { page?: number; limit?: number },
  ): Promise<StockReconciliationListResult> {
    const pool = getPool();
    const limit = Math.min(Math.max(filter?.limit || 20, 1), 100);
    const offset = Math.max((filter?.page || 1) - 1, 0) * limit;

    const countRes = await pool.query<{ count: string }>(
      'SELECT count(*) as count FROM stock_reconciliation_audits WHERE venue_id = $1',
      [venueId],
    );
    const totalCount = parseInt(countRes.rows[0]?.count || '0', 10);

    const res = await pool.query<any>(
      `SELECT sra.*, u.email as performed_by_name
         FROM stock_reconciliation_audits sra
         LEFT JOIN users u ON u.id = sra.performed_by
        WHERE sra.venue_id = $1
        ORDER BY sra.created_at DESC
        LIMIT $2 OFFSET $3`,
      [venueId, limit, offset],
    );

    const audits: StockReconciliationAuditDetail[] = [];
    for (const row of res.rows) {
      const itemsRes = await pool.query<any>(
        `SELECT sri.*, p.title as product_title
           FROM stock_reconciliation_items sri
           LEFT JOIN products p ON p.id = sri.product_id
          WHERE sri.audit_id = $1
          ORDER BY sri.created_at ASC`,
        [row.id],
      );
      audits.push(this.mapReconciliationAudit(row, itemsRes.rows));
    }

    return { audits, total_count: totalCount };
  }

  async getStockReconciliationById(
    venueId: string,
    auditId: string,
  ): Promise<StockReconciliationAuditDetail> {
    const pool = getPool();
    const res = await pool.query<any>(
      `SELECT sra.*, u.email as performed_by_name
         FROM stock_reconciliation_audits sra
         LEFT JOIN users u ON u.id = sra.performed_by
        WHERE sra.id = $1 AND sra.venue_id = $2`,
      [auditId, venueId],
    );

    if (res.rows.length === 0) {
      throw new AuthHttpError(
        HttpStatus.NOT_FOUND,
        'RECONCILIATION_NOT_FOUND',
        'Stock reconciliation audit not found.',
      );
    }
    const audit = res.rows[0];

    const itemsRes = await pool.query<any>(
      `SELECT sri.*, p.title as product_title
         FROM stock_reconciliation_items sri
         LEFT JOIN products p ON p.id = sri.product_id
        WHERE sri.audit_id = $1
        ORDER BY sri.created_at ASC`,
      [auditId],
    );

    return this.mapReconciliationAudit(audit, itemsRes.rows);
  }

  // ---------------------------------------------------------------------------
  // Row Mappers
  // ---------------------------------------------------------------------------

  private mapReconciliationAudit(row: any, items: any[]): StockReconciliationAuditDetail {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      venue_id: row.venue_id,
      performed_by: row.performed_by,
      performed_by_name: row.performed_by_name || null,
      items_counted: Number(row.items_counted || 0),
      discrepancy_items_count: Number(row.discrepancy_items_count || 0),
      total_discrepancy_units: Number(row.total_discrepancy_units || 0),
      total_shrinkage_value_minor: Number(row.total_shrinkage_value_minor || 0),
      notes: row.notes || null,
      status: row.status,
      items: items.map((i) => ({
        id: i.id,
        product_id: i.product_id,
        product_title: i.product_title || null,
        expected_stock: Number(i.expected_stock || 0),
        counted_stock: Number(i.counted_stock || 0),
        discrepancy_quantity: Number(i.discrepancy_quantity || 0),
        discrepancy_value_minor: Number(i.discrepancy_value_minor || 0),
        adjustment_type: i.adjustment_type,
        notes: i.notes || null,
        created_at: new Date(i.created_at).toISOString(),
      })),
      created_at: new Date(row.created_at).toISOString(),
      completed_at: new Date(row.completed_at || row.created_at).toISOString(),
    };
  }

  private mapCategory(row: any): MenuCategory {
    return {
      id: row.id,
      venue_id: row.venue_id,
      name: row.name,
      description: row.description || null,
      sort_order: Number(row.sort_order || 0),
      active: Boolean(row.active),
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  private mapProduct(row: any): ProductItem {
    const onHand = Number(row.stock_on_hand || 0);
    const reserved = Number(row.stock_reserved || 0);
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      venue_id: row.venue_id,
      category_id: row.category_id || null,
      category_name: row.category_name || null,
      sku: row.sku || null,
      title: row.title,
      description: row.description || null,
      image_url: row.image_url || null,
      price_minor: Number(row.price_minor),
      currency: row.currency || 'RON',
      tax_category: row.tax_category,
      active: Boolean(row.active),
      inventory_tracking: Boolean(row.inventory_tracking),
      stock_on_hand: onHand,
      stock_reserved: reserved,
      stock_available: Math.max(0, onHand - reserved),
      min_qty: Number(row.min_qty || 1),
      max_qty: Number(row.max_qty || 10),
      preparation_minutes: Number(row.preparation_minutes || 0),
      fulfillment_methods: row.fulfillment_methods || ['AT_STATION', 'BAR_PICKUP'],
      restricted_product_type: row.restricted_product_type || 'NONE',
      age_verification_required: Boolean(row.age_verification_required),
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }
}
