import Image from 'next/image'
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
        }
      `}</style>
      <div
        className="delivery-note bg-white mx-auto px-10 py-8"
        style={{
          maxWidth: '720px',
          color: '#1a1a1a',
          fontSize: '13px',
          lineHeight: '1.6',
          fontFamily: "var(--font-noto-jp), 'Noto Sans JP', sans-serif",
        }}
      >
      {/* ヘッダー: ロゴ＋会社情報（左） ／ 注文番号・発行日（右） */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <Image
            src="/logo.jpg"
            alt="株式会社善兵衛"
            width={80}
            height={80}
            style={{ objectFit: 'contain', flexShrink: 0 }}
          />
          <div style={{ lineHeight: '1.7' }}>
            <p style={{ fontSize: '14px', fontWeight: 'bold', margin: 0 }}>株式会社善兵衛</p>
            <p style={{ fontSize: '10px', color: '#888', margin: 0 }}>〒643-0006 和歌山県有田郡湯浅町大字田340-3</p>
            <p style={{ fontSize: '10px', color: '#888', margin: 0 }}>TEL 080-5331-1066　info@zenbeefarm.jp</p>
          </div>
        </div>
        <div style={{ textAlign: 'right', lineHeight: '1.8' }}>
          <p style={{ fontSize: '10px', color: '#888', margin: 0 }}>No. {order.order_number}</p>
          <p style={{ fontSize: '10px', color: '#888', margin: 0 }}>発行日: {today}</p>
        </div>
      </div>

      {/* タイトル */}
      <h1 style={{ textAlign: 'center', fontSize: '22px', fontWeight: 'bold', letterSpacing: '10px', margin: '0 0 8px 0' }}>
        納 品 書
      </h1>
      <hr style={{ border: 'none', borderTop: '1.5px solid #1a1a1a', marginBottom: '20px' }} />

      {/* 宛名 */}
      <div style={{ marginBottom: '6px' }}>
        <p style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>
          {company?.company_name ?? ''}　様
        </p>
      </div>
      <hr style={{ border: 'none', borderTop: '0.5px solid #1a1a1a', width: '220px', marginBottom: '10px', marginLeft: 0 }} />

      {/* 納品日 */}
      <p style={{ fontSize: '11px', color: '#777', margin: '0 0 8px 0' }}>
        納品日: {order.delivery_date ? toJpDate(order.delivery_date) : '—'}
      </p>

      {/* 本文 */}
      <p style={{ fontSize: '11px', margin: '0 0 18px 0' }}>下記の通り納品いたします。</p>

      {/* 明細テーブル */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
        <thead>
          <tr style={{ borderTop: '1.5px solid #1a1a1a', borderBottom: '0.5px solid #bbb' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: '600', fontSize: '12px' }}>品名</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: '600', fontSize: '12px', width: '52px' }}>数量</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: '600', fontSize: '12px', width: '80px' }}>単価</th>
            <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: '600', fontSize: '12px', width: '44px' }}>税率</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: '600', fontSize: '12px', width: '84px' }}>金額</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} style={{ borderBottom: '0.5px solid #e5e5e5' }}>
              <td style={{ padding: '6px 8px' }}>{item.product_name}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{item.quantity}{item.unit}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatCurrency(item.unit_price)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: '11px' }}>8%※</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatCurrency(item.subtotal)}</td>
            </tr>
          ))}
          {shipping.map((line) => (
            <tr key={line.id} style={{ borderBottom: '0.5px solid #e5e5e5' }}>
              <td style={{ padding: '6px 8px', color: '#777' }}>（送料）{line.label}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: '#777' }}>{line.quantity}個</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: '#777' }}>{formatCurrency(line.unit_cost)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: '11px', color: '#777' }}>10%</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: '#777' }}>{formatCurrency(line.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 合計エリア（右寄せ） */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <table style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {itemsSubtotal > 0 && (
              <>
                <tr>
                  <td style={{ padding: '3px 24px 3px 0', color: '#777', fontSize: '12px', whiteSpace: 'nowrap' }}>小計（税抜・8%対象）</td>
                  <td style={{ padding: '3px 0', textAlign: 'right', fontSize: '12px', minWidth: '90px' }}>{formatCurrency(itemsExcl)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 24px 3px 0', color: '#777', fontSize: '12px' }}>8%対象 消費税</td>
                  <td style={{ padding: '3px 0', textAlign: 'right', fontSize: '12px' }}>{formatCurrency(tax8)}</td>
                </tr>
              </>
            )}
            {shippingSubtotal > 0 && (
              <>
                <tr>
                  <td style={{ padding: '3px 24px 3px 0', color: '#777', fontSize: '12px', whiteSpace: 'nowrap' }}>小計（税抜・10%対象）</td>
                  <td style={{ padding: '3px 0', textAlign: 'right', fontSize: '12px' }}>{formatCurrency(shippingExcl)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 24px 3px 0', color: '#777', fontSize: '12px' }}>10%対象 消費税</td>
                  <td style={{ padding: '3px 0', textAlign: 'right', fontSize: '12px' }}>{formatCurrency(tax10)}</td>
                </tr>
              </>
            )}
            <tr style={{ borderTop: '1.5px solid #1a1a1a' }}>
              <td style={{ padding: '6px 24px 4px 0', fontWeight: 'bold', fontSize: '15px' }}>合計（税込）</td>
              <td style={{ padding: '6px 0 4px 0', textAlign: 'right', fontWeight: 'bold', fontSize: '15px' }}>
                {formatCurrency(order.total_amount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 軽減税率注記 */}
      {itemsSubtotal > 0 && (
        <p style={{ fontSize: '9px', color: '#aaa', margin: '0 0 12px 0' }}>
          ※ 軽減税率（8%）対象品目
        </p>
      )}

      {/* 備考 */}
      {order.notes && (
        <div style={{ border: '0.5px solid #e5e5e5', borderRadius: '4px', padding: '8px 12px', marginTop: '4px' }}>
          <p style={{ fontSize: '10px', fontWeight: '600', color: '#777', margin: '0 0 4px 0' }}>備考</p>
          <p style={{ fontSize: '12px', color: '#444', whiteSpace: 'pre-wrap', margin: 0 }}>{order.notes}</p>
        </div>
      )}
    </div>
    </>
  )
}
