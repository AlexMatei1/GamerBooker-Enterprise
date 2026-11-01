export interface MenuCategory {
  id: string;
  venue_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCategoryInput {
  name: string;
  description?: string;
  sort_order?: number;
  active?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string;
  sort_order?: number;
  active?: boolean;
}

export type TaxCategory = 'STANDARD' | 'REDUCED' | 'EXEMPT';

export type RestrictedProductType =
  | 'NONE'
  | 'ENERGY_DRINK'
  | 'ALCOHOL'
  | 'AGE_RESTRICTED';

export interface ProductItem {
  id: string;
  tenant_id: string;
  venue_id: string;
  category_id: string | null;
  category_name?: string | null;
  sku: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  price_minor: number;
  currency: string;
  tax_category: TaxCategory;
  active: boolean;
  inventory_tracking: boolean;
  stock_on_hand: number;
  stock_reserved: number;
  stock_available: number;
  min_qty: number;
  max_qty: number;
  preparation_minutes: number;
  fulfillment_methods: string[];
  restricted_product_type: RestrictedProductType;
  age_verification_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateProductInput {
  category_id?: string;
  sku?: string;
  title: string;
  description?: string;
  image_url?: string;
  price_minor: number;
  currency?: string;
  tax_category?: TaxCategory;
  active?: boolean;
  inventory_tracking?: boolean;
  initial_stock?: number;
  min_qty?: number;
  max_qty?: number;
  preparation_minutes?: number;
  fulfillment_methods?: string[];
  restricted_product_type?: RestrictedProductType;
  age_verification_required?: boolean;
}

export interface UpdateProductInput {
  category_id?: string | null;
  sku?: string | null;
  title?: string;
  description?: string | null;
  image_url?: string | null;
  price_minor?: number;
  currency?: string;
  tax_category?: TaxCategory;
  active?: boolean;
  inventory_tracking?: boolean;
  min_qty?: number;
  max_qty?: number;
  preparation_minutes?: number;
  fulfillment_methods?: string[];
  restricted_product_type?: RestrictedProductType;
  age_verification_required?: boolean;
}

export type StockMovementType =
  | 'INITIAL_STOCK'
  | 'RESTOCK'
  | 'ADJUSTMENT'
  | 'RESERVATION_HOLD'
  | 'RESERVATION_RELEASE'
  | 'ORDER_DEDUCT'
  | 'RETURN_RESTOCK'
  | 'DAMAGE_WASTE';

export interface AdjustStockInput {
  quantity_delta: number;
  movement_type: 'RESTOCK' | 'ADJUSTMENT' | 'DAMAGE_WASTE';
  notes?: string;
}

export interface StockMovementItem {
  id: string;
  product_id: string;
  movement_type: StockMovementType;
  quantity_delta: number;
  balance_after: number;
  actor_id: string | null;
  actor_role: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

export interface BulkImportItem {
  sku?: string;
  category_name?: string;
  category_id?: string;
  title: string;
  description?: string;
  price_minor: number;
  initial_stock?: number;
  inventory_tracking?: boolean;
  restricted_product_type?: RestrictedProductType;
  age_verification_required?: boolean;
}

export interface BulkImportProductsInput {
  products: BulkImportItem[];
  dry_run?: boolean;
}

export interface BulkImportResult {
  imported_count: number;
  dry_run: boolean;
  errors: Array<{ index: number; sku?: string; error: string }>;
  products: ProductItem[];
}

export interface UploadImageInput {
  image_url?: string;
  filename?: string;
  content_type?: string;
  image_base64?: string;
}
