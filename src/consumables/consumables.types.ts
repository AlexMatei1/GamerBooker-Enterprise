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

export interface StockReconciliationCountItem {
  product_id: string;
  counted_stock: number;
  notes?: string;
}

export interface PerformStockReconciliationInput {
  items: StockReconciliationCountItem[];
  notes?: string;
}

export interface StockReconciliationItemDetail {
  id: string;
  product_id: string;
  product_title?: string;
  expected_stock: number;
  counted_stock: number;
  discrepancy_quantity: number;
  discrepancy_value_minor: number;
  adjustment_type: 'NONE' | 'SHRINKAGE' | 'SURPLUS';
  notes?: string | null;
  created_at: string;
}

export interface StockReconciliationAuditDetail {
  id: string;
  tenant_id: string;
  venue_id: string;
  performed_by: string;
  performed_by_name?: string;
  items_counted: number;
  discrepancy_items_count: number;
  total_discrepancy_units: number;
  total_shrinkage_value_minor: number;
  notes?: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED';
  items: StockReconciliationItemDetail[];
  created_at: string;
  completed_at: string;
}

export interface StockReconciliationListResult {
  audits: StockReconciliationAuditDetail[];
  total_count: number;
}

