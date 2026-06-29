import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// 請求書1件の表示用データ（請求書HTML印刷ページ用）を返す。
// 認証は middleware（/api/admin/*）で実施済みのため、ここでは集計のみ行う。
// 集計ロジックは freee-csv（src/app/api/freee-csv/route.ts）と同一の考え方:
//   - 商品行は 8%（軽減税率）、送料行は 10%（標準税率）
//   - 単価・金額は税込（order.total_amount の積み上げと一致する）

type LineItem = {
  date: string // "M/D"
  description: string
  quantity: number
  unit: string
  unitPrice: number
  amount: number
  taxRate: '8' | '10'
  reduced: boolean // 軽減税率(8%)対象か
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
    order_items?: OrderItemRow[]
    order_shipping?: Array<{ label: string; cost: number }>
  } | null
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const invoiceId = searchParams.get('invoiceId')
    const companyId = searchParams.get('companyId')
    const billingMonth = searchParams.get('billingMonth')

    if (!invoiceId && !(companyId && billingMonth)) {
      return NextResponse.json(
        { error: 'invoiceId または companyId+billingMonth を指定してください' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

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
            order_items (product_name, unit, quantity, unit_price, subtotal, tier_label, tier_quantity, is_custom, product:products (name, unit, category)),
            order_shipping (label, cost)
          )
        )
      `)

    if (invoiceId) {
      query = query.eq('id', invoiceId)
    } else {
      query = query.eq('company_id', companyId!).eq('billing_month', billingMonth!)
    }

    const { data: invoice, error } = await query.single()

    if (error || !invoice) {
      return NextResponse.json({ error: '請求書が見つかりません' }, { status: 404 })
    }

    // 請求先会社（invoice.company_id は親会社まとめの場合は親会社）。
    // 請求先住所の解決順: has_separate_billing=true なら billing_*、無ければ通常住所。
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
    // 宛名: billing_name があればそれ、無ければ company_name
    const billingName =
      (useBilling && company?.billing_name) ? company.billing_name : (company?.company_name ?? '')
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

    // 明細行（freee-csv と同一ロジック）
    const lineItems: LineItem[] = []
    const invoiceItems = (invoice.invoice_items || []) as InvoiceItemRow[]

    for (const invItem of invoiceItems) {
      const order = invItem.order
      if (!order) continue

      const sd = order.shipping_date || ''
      const parts = sd.split('-')
      const md = parts[1] && parts[2] ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : ''

      // 商品明細（8% 軽減税率）
      for (const oi of order.order_items || []) {
        const itemName = oi.product?.name ?? oi.product_name ?? ''
        const itemUnit = oi.product?.unit ?? oi.unit ?? ''
        // tier_quantity がある場合は実本数（quantity × tier_quantity）
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

      // 送料明細（10% 標準税率、cost=0 はスキップ）
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

    // 税区分別サマリ（単価・金額は税込）
    const subtotal8 = lineItems.filter((l) => l.taxRate === '8').reduce((s, l) => s + l.amount, 0)
    const subtotal10 = lineItems.filter((l) => l.taxRate === '10').reduce((s, l) => s + l.amount, 0)
    const tax8 = Math.floor(subtotal8 - subtotal8 / 1.08)
    const tax10 = Math.floor(subtotal10 - subtotal10 / 1.1)
    const grandTotal = subtotal8 + subtotal10

    return NextResponse.json({
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
      summary: {
        subtotal8,
        tax8,
        subtotal10,
        tax10,
        grandTotal,
      },
    })
  } catch (err) {
    console.error('請求書詳細取得エラー:', err)
    return NextResponse.json({ error: '請求書詳細の取得に失敗しました' }, { status: 500 })
  }
}
