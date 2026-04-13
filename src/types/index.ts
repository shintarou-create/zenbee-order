// ============================================================
// 善兵衛農園 BtoB発注システム TypeScript型定義
// ============================================================

export type PriceRank = 'standard' | 'premium' | 'vip'
export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'
export type CoolType = 0 | 1
export type AdminRole = 'admin' | 'superadmin'

// ============================================================
// Customer
// ============================================================
export interface Customer {
  id: string
  line_user_id: string
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
  delivery_time_slot: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CustomerInput = Omit<Customer, 'id' | 'created_at' | 'updated_at'>
export type CustomerUpdate = Partial<CustomerInput>

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
  customer_id: string
  status: OrderStatus
  total_amount: number
  shipping_date: string | null
  delivery_date: string | null
  delivery_time_slot: string | null
  cool_type: CoolType
  notes: string | null
  admin_notes: string | null
  created_at: string
  updated_at: string
  // Joined fields
  customer?: Customer
  order_items?: OrderItem[]
}

export type OrderInput = Omit<Order, 'id' | 'created_at' | 'updated_at' | 'customer' | 'order_items'>
export type OrderUpdate = Partial<Pick<Order, 'status' | 'shipping_date' | 'delivery_date' | 'delivery_time_slot' | 'admin_notes'>>

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
// Invoice
// ============================================================
export interface Invoice {
  id: string
  invoice_number: string
  customer_id: string
  billing_month: string
  total_amount: number
  tax_amount: number
  status: InvoiceStatus
  due_date: string | null
  paid_at: string | null
  created_at: string
  // Joined fields
  customer?: Customer
  invoice_items?: InvoiceItem[]
}

export type InvoiceInput = Omit<Invoice, 'id' | 'created_at' | 'customer' | 'invoice_items'>

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
