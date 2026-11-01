export interface PackageItemInput {
  product_id: string;
  quantity: number;
  allocated_price_minor?: number;
}

export interface CreatePackageInput {
  name: string;
  description?: string;
  resource_type: string;
  duration_minutes: number;
  fixed_price_minor: number;
  currency?: string;
  active?: boolean;
  items?: PackageItemInput[];
}

export interface UpdatePackageInput {
  name?: string;
  description?: string;
  resource_type?: string;
  duration_minutes?: number;
  fixed_price_minor?: number;
  active?: boolean;
  items?: PackageItemInput[];
}

export interface PackageItemDetail {
  id: string;
  product_id: string;
  product_title: string;
  quantity: number;
  allocated_price_minor: number;
  price_minor: number;
  tax_category: string;
  age_verification_required: boolean;
  stock_available: number;
}

export interface PackageDetail {
  id: string;
  tenant_id: string;
  venue_id: string;
  name: string;
  description: string | null;
  resource_type: string;
  duration_minutes: number;
  fixed_price_minor: number;
  currency: string;
  active: boolean;
  items: PackageItemDetail[];
  created_at: string;
  updated_at: string;
}

export interface PackageQuoteInput {
  package_id: string;
  resource_id: string;
  starts_at: string;
}
