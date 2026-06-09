import type { Order } from '@/types'
import { formatCurrency } from '@/lib/utils'

function toJpDate(dateStr: string): string {
  const s = dateStr.split('T')[0]
  const [y, m, d] = s.split('-').map(Number)
  return `${y}年${m}月${d}日`
}

interface Props {
  order: Order
}

export default function DeliveryNoteLayout({ order }: Props) {
  const company = order.company
  const items = order.order_items ?? []
  const shipping = order.order_shipping ?? []

  const itemsSubtotal = items.reduce((sum, i) => sum + i.subtotal, 0)
  const shippingSubtotal = shipping.reduce((sum, s) => sum + s.cost, 0)
  const tax8 = Math.floor((itemsSubtotal * 8) / 108)
  const tax10 = Math.floor((shippingSubtotal * 10) / 110)
  const itemsExcl = itemsSubtotal - tax8
  const shippingExcl = shippingSubtotal - tax10

  const today = toJpDate(new Date().toISOString())

  return (
    <>
      <style>{`
        @media print {
          .delivery-note,
          .delivery-note * {
            font-family: var(--font-noto-jp), 'Noto Sans JP', sans-serif !important;
          }
          .delivery-note {
            padding-top: 0;
            min-height: 273mm;
          }
        }
      `}</style>
      <div
        className="delivery-note bg-white mx-auto px-10 py-8"
        style={{
          maxWidth: '720px',
          color: '#111',
          fontSize: '13px',
          lineHeight: '1.6',
          fontFamily: "var(--font-noto-jp), 'Noto Sans JP', sans-serif",
          display: 'flex',
          flexDirection: 'column',
        }}
      >

      {/* (1) ヘッダー: ロゴ＋会社情報（左） ／ 伝票No.・発行日（右） */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mono.png" alt="善兵衛農園" style={{ height: 44, width: 'auto' }} />
          <div style={{ lineHeight: '1.6' }}>
            <p style={{ fontSize: '14px', fontWeight: 500, margin: 0 }}>株式会社善兵衛</p>
            <p style={{ fontSize: '10px', color: '#444', margin: 0 }}>〒643-0006 和歌山県有田郡湯浅町大字田340-3</p>
            <p style={{ fontSize: '10px', color: '#444', margin: 0 }}>TEL 080-5331-1066　info@zenbeefarm.jp</p>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '10px', color: '#444', lineHeight: '1.7' }}>
          <p style={{ margin: 0 }}>No. {order.order_number}</p>
          <p style={{ margin: 0 }}>発行日: {today}</p>
        </div>
      </div>

      {/* (2) タイトル「納品書」 */}
      <h1 style={{
        textAlign: 'center',
        fontSize: '25px',
        fontFamily: "'Noto Serif JP', serif",
        fontWeight: 'normal',
        letterSpacing: '0.55em',
        paddingLeft: '0.55em',
        color: '#111',
        margin: 0,
      }}>
        納品書
      </h1>
      <div style={{ width: '54px', height: '1px', background: '#111', margin: '9px auto 20px' }} />

      {/* (3) 宛名ブロック（横並び・align-items flex-end） */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
        <p style={{
          fontSize: '18px',
          fontWeight: 500,
          margin: 0,
          borderBottom: '1px solid #111',
          paddingBottom: '5px',
          minWidth: '56%',
        }}>
          {company?.company_name ?? ''}　様
        </p>
        <div style={{ textAlign: 'right', fontSize: '11px', color: '#444' }}>
          <p style={{ margin: 0 }}>納品日: {order.delivery_date ? toJpDate(order.delivery_date) : '—'}</p>
          <p style={{ margin: 0 }}>下記の通り納品いたします。</p>
        </div>
      </div>

      {/* (4) 明細テーブル */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' }}>
        <thead>
          <tr style={{ borderTop: '2px solid #111', borderBottom: '2px solid #111' }}>
            <th style={{ textAlign: 'left', padding: '6px 6px', fontWeight: 500, fontSize: '11px', letterSpacing: '0.05em' }}>品名</th>
            <th style={{ textAlign: 'right', padding: '6px 6px', fontWeight: 500, fontSize: '11px', letterSpacing: '0.05em', width: '70px' }}>数量</th>
            <th style={{ textAlign: 'right', padding: '6px 6px', fontWeight: 500, fontSize: '11px', letterSpacing: '0.05em', width: '80px' }}>単価</th>
            <th style={{ textAlign: 'right', padding: '6px 6px', fontWeight: 500, fontSize: '11px', letterSpacing: '0.05em', width: '55px' }}>税率</th>
            <th style={{ textAlign: 'right', padding: '6px 6px', fontWeight: 500, fontSize: '11px', letterSpacing: '0.05em', width: '95px' }}>金額</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const hasTier = !!item.tier_quantity
            const realBottles = hasTier ? item.quantity * item.tier_quantity! : null
            return (
              <tr key={item.id} style={{ borderBottom: '1px solid #ccc' }}>
                <td style={{ padding: '14px 6px' }}>
                  {item.product_name}
                  {item.tier_label && (
                    <span style={{ marginLeft: '6px', fontSize: '10px', color: '#888', background: '#f3f4f6', borderRadius: '3px', padding: '1px 4px' }}>
                      {item.tier_label}
                    </span>
                  )}
                </td>
                <td style={{ padding: '14px 6px', textAlign: 'right' }}>
                  {hasTier
                    ? `${item.quantity}ケース（${realBottles}本）`
                    : `${item.quantity}${item.unit}`
                  }
                </td>
                <td style={{ padding: '14px 6px', textAlign: 'right' }}>{formatCurrency(item.unit_price)}</td>
                <td style={{ padding: '14px 6px', textAlign: 'right', color: '#444' }}>8%※</td>
                <td style={{ padding: '14px 6px', textAlign: 'right', fontSize: '15px', fontWeight: 500 }}>{formatCurrency(item.subtotal)}</td>
              </tr>
            )
          })}
          {shipping.map((line) => (
            <tr key={line.id} style={{ borderBottom: '1px solid #ccc' }}>
              <td style={{ padding: '14px 6px', color: '#444' }}>（送料）{line.label}</td>
              <td style={{ padding: '14px 6px', textAlign: 'right' }}>{line.quantity}個</td>
              <td style={{ padding: '14px 6px', textAlign: 'right' }}>{formatCurrency(line.unit_cost)}</td>
              <td style={{ padding: '14px 6px', textAlign: 'right', color: '#444' }}>10%</td>
              <td style={{ padding: '14px 6px', textAlign: 'right', fontSize: '15px', fontWeight: 500 }}>{formatCurrency(line.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* スペーサー: 合計欄を紙の下方へ押し下げる（行数に応じて伸縮） */}
      <div style={{ flex: 1 }} />

      {/* (5) 税率別内訳＋合計（右寄せ） */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <div style={{ width: '58%' }}>
          {itemsSubtotal > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#444', padding: '3px 2px' }}>
                <span>小計（税抜・8%対象）</span>
                <span>{formatCurrency(itemsExcl)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#444', padding: '3px 2px' }}>
                <span>8%対象 消費税</span>
                <span>{formatCurrency(tax8)}</span>
              </div>
            </>
          )}
          {shippingSubtotal > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#444', padding: '3px 2px' }}>
                <span>小計（税抜・10%対象）</span>
                <span>{formatCurrency(shippingExcl)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#444', padding: '3px 2px' }}>
                <span>10%対象 消費税</span>
                <span>{formatCurrency(tax10)}</span>
              </div>
            </>
          )}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderTop: '1px solid #111',
            borderBottom: '3px double #111',
            marginTop: '7px',
            padding: '9px 2px',
          }}>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>合計（税込）</span>
            <span style={{ fontSize: '24px', fontWeight: 500, color: '#111' }}>{formatCurrency(order.total_amount)}</span>
          </div>
        </div>
      </div>

      {/* (6) 脚注 */}
      {itemsSubtotal > 0 && (
        <p style={{ fontSize: '10px', color: '#666', marginTop: '20px', marginBottom: 0 }}>
          ※ 軽減税率（8%）対象品目
        </p>
      )}

      {/* 備考 */}
      {order.notes && (
        <div style={{ border: '0.5px solid #e5e5e5', borderRadius: '4px', padding: '8px 12px', marginTop: '12px' }}>
          <p style={{ fontSize: '10px', fontWeight: '600', color: '#777', margin: '0 0 4px 0' }}>備考</p>
          <p style={{ fontSize: '12px', color: '#444', whiteSpace: 'pre-wrap', margin: 0 }}>{order.notes}</p>
        </div>
      )}
    </div>
    </>
  )
}
