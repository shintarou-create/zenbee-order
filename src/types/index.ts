// ============================================================
// 善兵衛農園 BtoB発注システム TypeScript型定義 v2
// DB構造v2: companies + line_users 分離対応
// ============================================================

export type PriceRank = 'standard' | 'premium' | 'vip'
export type OrderStatus = 'pending' | 'shipped' | 'done' | 'cancelled'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
export type CoolType = 0 | 1
export type AdminRole = 'admin' | 'superadmin'
export type StockStatus = 'ok' | 'low' | 'out'

// ============================================================
// Company（旧 Customer）
// ============================================================
export interface Company {
  id: string
  company_name: string
  representative_name: string | null
  postal_code: string | null
  prefecture: string | null
  city: string | null
  address: string | null
  building: string | null
  phone: string | null
  email: string | null
  price_rank: PriceRank
  notes: string | null
  is_active: boolean
  // 請求先（デフォルト）
  has_separate_billing: boolean
  billing_name: string | null
  billing_postal_code: string | null
  billing_prefecture: string | null
  billing_city: string | null
  billing_address: string | null
  billing_building: string | null
  created_at: string
  updated_at: string
  // Joined fields
  line_users?: LineUser[]
}

export type CompanyInput = Omit<Company, 'id' | 'created_at' | 'updated_at' | 'line_users'>
export type CompanyUpdate = Partial<CompanyInput>

// 後方互換: 既存コードが Customer を参照している箇所向け
export type Customer = Company
export type CustomerInput = CompanyInput
export type CustomerUpdate = CompanyUpdate

// ============================================================
// LineUser
// ============================================================
export interface LineUser {
  id: string
  line_user_id: string
  company_id: string | null
  display_name: string | null
  picture_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  // Joined fields
  company?: Company
}

export type LineUserInput = Omit<LineUser, 'id' | 'created_at' | 'updated_at' | 'company'>

// ============================================================
// Product
// ============================================================
export interface Product {
  id: string
  name: string
  category: string
  unit: string
  min_order_qty: number
  max_order_qty: number
  step_qty: number
  cool_type: CoolType
  is_seasonal: boolean
  season_start: string | null
  season_end: string | null
  sort_order: number
  is_active: boolean
  image_url: string | null
  description: string | null
  created_at: string
  updated_at: string
  // Joined fields
  product_prices?: ProductPrice[]
  inventory?: Inventory | null
  current_price?: number
}

export type ProductInput = Omit<Product, 'id' | 'created_at' | 'updated_at' | 'product_prices' | 'inventory' | 'current_price'>
export type ProductUpdate = Partial<ProductInput>

// ============================================================
// ProductPrice
// ============================================================
export interface ProductPrice {
  id: string
  product_id: string
  price_rank: PriceRank
  price_per_unit: number
}

export type ProductPriceInput = Omit<ProductPrice, 'id'>

// ============================================================
// Inventory
// ============================================================
export interface Inventory {
  id: string
  product_id: string
  available_qty: number
  reserved_qty: number
  updated_at: string
}

export type InventoryUpdate = Pick<Inventory, 'available_qty' | 'reserved_qty'>

// ============================================================
// Order
// ============================================================
export interface Order {
  id: string
  order_number: string
  company_id: string
  status: OrderStatus
  total_amount: number
  shipping_date: string | null
  delivery_date: string | null
  notes: string | null
  admin_notes: string | null
  // 請求先オーバーライド（null = 会社デフォルトを使用）
  billing_name: string | null
  billing_postal_code: string | null
  billing_prefecture: string | null
  billing_city: string | null
  billing_address: string | null
  billing_building: string | null
  created_at: string
  updated_at: string
  // Joined fields
  company?: Company
  order_items?: OrderItem[]
  order_shipping?: OrderShippingLine[]
}

export type OrderInput = Omit<Order, 'id' | 'created_at' | 'updated_at' | 'company' | 'order_items' | 'order_shipping'>
export type OrderUpdate = Partial<Pick<Order, 'status' | 'shipping_date' | 'delivery_date' | 'admin_notes' | 'billing_name' | 'billing_postal_code' | 'billing_prefecture' | 'billing_city' | 'billing_address' | 'billing_building'>>

// ============================================================
// OrderItem
// ============================================================
export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  product_name: string
  quantity: number
  unit: string
  unit_price: number
  subtotal: number
  // Joined fields
  product?: Product
}

export type OrderItemInput = Omit<OrderItem, 'id' | 'product'>

// ============================================================
// OrderShippingLine（送料明細）
// ============================================================
export interface OrderShippingLine {
  id: string
  order_id: string
  label: string
  quantity: number
  unit_cost: number
  cost: number
  sort_order: number
}

export type OrderShippingLineInput = Omit<OrderShippingLine, 'id'>

// ============================================================
// Invoice（残存、freee CSV移行後に削除予定）
// ============================================================
export interface Invoice {
  id: string
  invoice_number: string
  company_id: string
  billing_month: string
  total_amount: number
  tax_amount: number
  status: InvoiceStatus
  due_date: string | null
  paid_at: string | null
  created_at: string
  // Joined fields
  company?: Company
  invoice_items?: InvoiceItem[]
}

export type InvoiceInput = Omit<Invoice, 'id' | 'created_at' | 'company' | 'invoice_items'>

// ============================================================
// InvoiceItem
// ============================================================
export interface InvoiceItem {
  id: string
  invoice_id: string
  order_id: string
  amount: number
  // Joined fields
  order?: Order
}

// ============================================================
// AdminUser
// ============================================================
export interface AdminUser {
  id: string
  line_user_id: string
  name: string
  role: AdminRole
}

// ============================================================
// Cart
// ============================================================
export interface CartItem {
  productId: string
  productName: string
  quantity: number
  unit: string
  unitPrice: number
  subtotal: number
  coolType: CoolType
  stepQty: number
  minOrderQty: number
}

export interface CartState {
  items: CartItem[]
  total: number
  itemCount: number
}

// ============================================================
// API Response Types
// ============================================================
export interface ApiResponse<T = void> {
  data?: T
  error?: string
  message?: string
}

export interface CreateOrderRequest {
  items: {
    productId: string
    quantity: number
  }[]
  notes?: string
  deliveryDate?: string
  liffAccessToken: string
}

export interface CreateOrderResponse {
  orderId: string
  orderNumber: string
  totalAmount: number
}

export interface ShippingCsvRequest {
  orderIds: string[]
  shipDate: string
}

// ============================================================
// Billing（請求先ヘルパー型）
// ============================================================
export interface BillingInfo {
  name: string | null
  postal_code: string | null
  prefecture: string | null
  city: string | null
  address: string | null
  building: string | null
}

/**
 * 注文の請求先を取得（オーバーライド優先、なければ会社デフォルト、なければ納品先）
 */
export function getOrderBillingInfo(order: Order, company: Company): BillingInfo {
  // 1. 注文レベルのオーバーライド
  if (order.billing_name) {
    return {
      name: order.billing_name,
      postal_code: order.billing_postal_code,
      prefecture: order.billing_prefecture,
      city: order.billing_city,
      address: order.billing_address,
      building: order.billing_building,
    }
  }
  // 2. 会社デフォルトの請求先
  if (company.has_separate_billing && company.billing_name) {
    return {
      name: company.billing_name,
      postal_code: company.billing_postal_code,
      prefecture: company.billing_prefecture,
      city: company.billing_city,
      address: company.billing_address,
      building: company.billing_building,
    }
  }
  // 3. 納品先 = 請求先
  return {
    name: company.company_name,
    postal_code: company.postal_code,
    prefecture: company.prefecture,
    city: company.city,
    address: company.address,
    building: company.building,
  }
}

// ============================================================
// LIFF Profile
// ============================================================
export interface LiffProfile {
  userId: string
  displayName: string
  pictureUrl?: string
  statusMessage?: string
}

// ============================================================
// Dashboard Stats
// ============================================================
export interface DashboardStats {
  todayOrderCount: number
  pendingOrderCount: number
  lowStockProducts: Array<{
    product: Product
    inventory: Inventory
  }>
  recentOrders: Order[]
}
