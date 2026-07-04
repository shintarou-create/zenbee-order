import type { SupabaseClient } from '@supabase/supabase-js'

// 請求書1件の表示用データ集計。請求書HTML印刷ページ・PDF生成の両方から使う共通ロジック。
// 集計は freee-csv と同一の考え方（商品8%軽減 / 送料10%標準・単価金額は税込）。

export type InvoiceLineItem = {
  date: string // "M/D"
  description: string
  quantity: number
  unit: string
  unitPrice: number
  amount: number
  taxRate: '8' | '10'
  reduced: boolean
}

export type InvoiceDetail = {
  invoice: {
    invoice_number: string
    billing_month: string
    total_amount: number
    tax_amount: number
    due_date: string | null
  }
  billing: {
    name: string
    company_name: string
    email: string | null
    postal_code: string | null
    prefecture: string | null
    city: string | null
    address: string | null
    building: string | null
  }
  lineItems: InvoiceLineItem[]
  summary: {
    subtotal8: number
    tax8: number
    subtotal10: number
    tax10: number
    grandTotal: number
  }
}

type OrderItemRow = {
  product_name: string
  unit: string
  quantity: number
  unit_price: number
  subtotal: number
  tier_label?: string | null
  tier_quantity?: number | null
  is_custom?: boolean | null
  product?: { name: string; unit: string; category: string } | null
}

type InvoiceItemRow = {
  order?: {
    shipping_date?: string | null
    delivery_date?: string | null
    order_items?: OrderItemRow[]
    order_shipping?: Array<{ label: string; cost: number }>
  } | null
}

export type InvoiceDetailQuery = { invoiceId?: string; companyId?: string; billingMonth?: string }

/**
 * 請求書の表示用データを集計して返す。見つからなければ null。
 */
export async function buildInvoiceDetail(
  supabase: SupabaseClient,
  q: InvoiceDetailQuery,
): Promise<InvoiceDetail | null> {
  let query = supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      billing_month,
      total_amount,
      tax_amount,
      due_date,
      company:companies (
        id,
        company_name,
        postal_code,
        prefecture,
        city,
        address,
        building,
        has_separate_billing,
        billing_name,
        billing_postal_code,
        billing_prefecture,
        billing_city,
        billing_address,
        billing_building,
        email
      ),
      invoice_items (
        order:orders (
          shipping_date,
          delivery_date,
          order_items (product_name, unit, quantity, unit_price, subtotal, tier_label, tier_quantity, is_custom, product:products (name, unit, category)),
          order_shipping (label, cost)
        )
      )
    `)

  if (q.invoiceId) {
    query = query.eq('id', q.invoiceId)
  } else if (q.companyId && q.billingMonth) {
    query = query.eq('company_id', q.companyId).eq('billing_month', q.billingMonth)
  } else {
    return null
  }

  const { data: invoice, error } = await query.single()
  if (error || !invoice) return null

  // 請求先会社（親会社まとめの場合は親会社）。住所解決順: has_separate_billing なら billing_*、無ければ通常住所。
  const company = invoice.company as {
    company_name?: string
    postal_code?: string | null
    prefecture?: string | null
    city?: string | null
    address?: string | null
    building?: string | null
    has_separate_billing?: boolean | null
    billing_name?: string | null
    billing_postal_code?: string | null
    billing_prefecture?: string | null
    billing_city?: string | null
    billing_address?: string | null
    billing_building?: string | null
    email?: string | null
  } | null

  const useBilling = company?.has_separate_billing === true
  const billingName =
    useBilling && company?.billing_name ? company.billing_name : company?.company_name ?? ''
  const billingAddress = useBilling
    ? {
        postal_code: company?.billing_postal_code ?? null,
        prefecture: company?.billing_prefecture ?? null,
        city: company?.billing_city ?? null,
        address: company?.billing_address ?? null,
        building: company?.billing_building ?? null,
      }
    : {
        postal_code: company?.postal_code ?? null,
        prefecture: company?.prefecture ?? null,
        city: company?.city ?? null,
        address: company?.address ?? null,
        building: company?.building ?? null,
      }

  const lineItems: InvoiceLineItem[] = []
  const invoiceItems = (invoice.invoice_items || []) as InvoiceItemRow[]

  for (const invItem of invoiceItems) {
    const order = invItem.order
    if (!order) continue

    // 「M/D納品」は納品日基準。delivery_date 優先・shipping_date フォールバック。
    const sd = order.delivery_date || order.shipping_date || ''
    const parts = sd.split('-')
    const md = parts[1] && parts[2] ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : ''

    for (const oi of order.order_items || []) {
      const itemName = oi.product?.name ?? oi.product_name ?? ''
      const itemUnit = oi.product?.unit ?? oi.unit ?? ''
      const realQty = oi.tier_quantity ? oi.quantity * oi.tier_quantity : oi.quantity
      const unitPrice = oi.unit_price || oi.subtotal
      const quantity = oi.unit_price ? realQty : 1
      const desc = oi.tier_label
        ? `${md}納品 ${itemName}（${oi.tier_label}）`
        : `${md}納品 ${itemName}`
      lineItems.push({
        date: md,
        description: desc,
        quantity,
        unit: itemUnit,
        unitPrice,
        amount: unitPrice * quantity,
        taxRate: '8',
        reduced: true,
      })
    }

    for (const os of order.order_shipping || []) {
      if (!os.cost) continue
      lineItems.push({
        date: md,
        description: `${md}納品 送料（${os.label}）`,
        quantity: 1,
        unit: '',
        unitPrice: os.cost,
        amount: os.cost,
        taxRate: '10',
        reduced: false,
      })
    }
  }

  const subtotal8 = lineItems.filter((l) => l.taxRate === '8').reduce((s, l) => s + l.amount, 0)
  const subtotal10 = lineItems.filter((l) => l.taxRate === '10').reduce((s, l) => s + l.amount, 0)
  const tax8 = Math.floor(subtotal8 - subtotal8 / 1.08)
  const tax10 = Math.floor(subtotal10 - subtotal10 / 1.1)
  const grandTotal = subtotal8 + subtotal10

  return {
    invoice: {
      invoice_number: invoice.invoice_number,
      billing_month: invoice.billing_month,
      total_amount: invoice.total_amount,
      tax_amount: invoice.tax_amount,
      due_date: invoice.due_date,
    },
    billing: {
      name: billingName,
      company_name: company?.company_name ?? '',
      email: company?.email ?? null,
      ...billingAddress,
    },
    lineItems,
    summary: { subtotal8, tax8, subtotal10, tax10, grandTotal },
  }
}
