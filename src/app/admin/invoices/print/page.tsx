'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { adminFetch } from '@/lib/admin-fetch'
import { formatCurrency } from '@/lib/utils'
import { waitForImages } from '@/lib/print-utils'

type LineItem = {
  date: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  amount: number
  taxRate: '8' | '10'
  reduced: boolean
}

type InvoiceDetail = {
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
  lineItems: LineItem[]
  summary: {
    subtotal8: number
    tax8: number
    subtotal10: number
    tax10: number
    grandTotal: number
  }
}

// 発行者（株式会社善兵衛）固定情報。納品書（DeliveryNoteLayout）と同一の本社住所。
const ISSUER = {
  name: '株式会社善兵衛',
  postal: '〒643-0006',
  address: '和歌山県有田郡湯浅町大字田340-3',
  representative: '代表取締役 井上信太郎',
  registrationNumber: '登録番号 T6170001016584',
}

const BANK = {
  bank: 'PayPay銀行 ビジネス営業部（店番005）',
  account: '普通 5419086',
  holder: 'カ）ゼンベエ（株式会社善兵衛）',
}

// 本日（JST）を「YYYY年M月D日」で返す
function jpToday(): string {
  const now = new Date()
  const jst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return `${jst.getFullYear()}年${jst.getMonth() + 1}月${jst.getDate()}日`
}

// "YYYY-MM-DD" を「YYYY年M月D日」に
function jpDate(d: string | null): string {
  if (!d) return '—'
  const parts = d.split('-')
  if (parts.length < 3) return d
  return `${parseInt(parts[0])}年${parseInt(parts[1])}月${parseInt(parts[2])}日`
}

export default function InvoicePrintPage() {
  const searchParams = useSearchParams()
  const [detail, setDetail] = useState<InvoiceDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printed, setPrinted] = useState(false)

  useEffect(() => {
    const invoiceId = searchParams.get('invoiceId')
    const companyId = searchParams.get('companyId')
    const billingMonth = searchParams.get('billingMonth')

    let url = ''
    if (invoiceId) {
      url = `/api/admin/invoice-detail?invoiceId=${encodeURIComponent(invoiceId)}`
    } else if (companyId && billingMonth) {
      url = `/api/admin/invoice-detail?companyId=${encodeURIComponent(companyId)}&billingMonth=${encodeURIComponent(billingMonth)}`
    } else {
      setError('請求書IDが指定されていません')
      setIsLoading(false)
      return
    }

    adminFetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || '請求書の取得に失敗しました')
        }
        return res.json()
      })
      .then((data: InvoiceDetail) => {
        setDetail(data)
        setIsLoading(false)
      })
      .catch((err) => {
        setError(err.message || '請求書の取得に失敗しました')
        setIsLoading(false)
      })
  }, [searchParams])

  // 読み込み完了後に自動で印刷（bulk-print と同じパターン）
  useEffect(() => {
    if (!isLoading && detail) {
      let cancelled = false
      ;(async () => {
        await waitForImages()
        if (cancelled) return
        window.print()
        setPrinted(true)
      })()
      return () => {
        cancelled = true
      }
    }
  }, [isLoading, detail])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">請求書を準備しています…</p>
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || '請求書が見つかりませんでした'}</p>
        <button
          onClick={() => window.close()}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          このタブを閉じる
        </button>
      </div>
    )
  }

  const { invoice, billing, lineItems, summary } = detail
  const addrLine = [billing.prefecture, billing.city, billing.address, billing.building]
    .filter(Boolean)
    .join('')

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 14mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* 操作バー（印刷時非表示） */}
      <div className="no-print mb-6 flex items-center gap-3 px-6 pt-4">
        <button
          onClick={async () => {
            await waitForImages()
            window.print()
            setPrinted(true)
          }}
          className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-lg text-sm transition-colors"
        >
          印刷する
        </button>
        {printed && (
          <button
            onClick={() => window.close()}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            タブを閉じる
          </button>
        )}
      </div>

      <div
        className="invoice-sheet bg-white mx-auto px-10 py-8"
        style={{
          maxWidth: '720px',
          color: '#111',
          fontSize: '13px',
          lineHeight: 1.6,
          fontFamily: "var(--font-noto-jp), 'Noto Sans JP', sans-serif",
        }}
      >
        {/* ヘッダー: タイトル / 右上 発行日・請求書番号 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <h1
            style={{
              fontSize: '26px',
              fontFamily: "'Noto Serif JP', serif",
              fontWeight: 'normal',
              letterSpacing: '0.4em',
              paddingLeft: '0.4em',
              margin: 0,
            }}
          >
            請求書
          </h1>
          <div style={{ textAlign: 'right', fontSize: '11px', color: '#444', lineHeight: 1.7 }}>
            <p style={{ margin: 0 }}>発行日: {jpToday()}</p>
            <p style={{ margin: 0 }}>請求書番号: {invoice.invoice_number}</p>
          </div>
        </div>

        {/* 宛名（左） / 発行者（右） */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', gap: '24px' }}>
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontSize: '18px',
                fontWeight: 500,
                margin: 0,
                borderBottom: '1px solid #111',
                paddingBottom: '5px',
              }}
            >
              {billing.name}　御中
            </p>
            <div style={{ fontSize: '11px', color: '#444', marginTop: '6px', lineHeight: 1.7 }}>
              {billing.postal_code && <p style={{ margin: 0 }}>〒{billing.postal_code}</p>}
              {addrLine && <p style={{ margin: 0 }}>{addrLine}</p>}
            </div>
          </div>

          {/* 発行者欄（固定） */}
          <div style={{ textAlign: 'right', fontSize: '11px', color: '#222', lineHeight: 1.8 }}>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 500 }}>{ISSUER.name}</p>
            <p style={{ margin: 0 }}>{ISSUER.postal} {ISSUER.address}</p>
            <p style={{ margin: 0 }}>{ISSUER.representative}</p>
            <p style={{ margin: 0 }}>{ISSUER.registrationNumber}</p>
          </div>
        </div>

        {/* ご請求金額（大きく） */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            border: '2px solid #111',
            padding: '10px 16px',
            marginBottom: '8px',
          }}
        >
          <span style={{ fontSize: '15px', fontWeight: 500 }}>ご請求金額</span>
          <span style={{ fontSize: '24px', fontWeight: 700 }}>{formatCurrency(summary.grandTotal)}</span>
        </div>
        <p style={{ fontSize: '11px', color: '#444', margin: '0 0 18px' }}>
          お支払期限: {jpDate(invoice.due_date)}
        </p>

        {/* 明細テーブル */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '16px' }}>
          <thead>
            <tr style={{ borderTop: '2px solid #111', borderBottom: '2px solid #111' }}>
              <th style={{ textAlign: 'left', padding: '6px', fontWeight: 500, fontSize: '11px', width: '52px' }}>日付</th>
              <th style={{ textAlign: 'left', padding: '6px', fontWeight: 500, fontSize: '11px' }}>品名</th>
              <th style={{ textAlign: 'right', padding: '6px', fontWeight: 500, fontSize: '11px', width: '50px' }}>数量</th>
              <th style={{ textAlign: 'left', padding: '6px', fontWeight: 500, fontSize: '11px', width: '44px' }}>単位</th>
              <th style={{ textAlign: 'right', padding: '6px', fontWeight: 500, fontSize: '11px', width: '72px' }}>単価</th>
              <th style={{ textAlign: 'right', padding: '6px', fontWeight: 500, fontSize: '11px', width: '84px' }}>金額</th>
              <th style={{ textAlign: 'right', padding: '6px', fontWeight: 500, fontSize: '11px', width: '48px' }}>税率</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '5px 6px' }}>{item.date}</td>
                <td style={{ padding: '5px 6px' }}>
                  {item.reduced && '★'}
                  {item.description}
                </td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>{item.quantity}</td>
                <td style={{ padding: '5px 6px' }}>{item.unit}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>{formatCurrency(item.unitPrice)}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>{formatCurrency(item.amount)}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>{item.taxRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 税区分別サマリ */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '12px', minWidth: '300px' }}>
            <tbody>
              <tr>
                <td style={{ padding: '4px 10px', color: '#444' }}>8%対象（軽減税率）</td>
                <td style={{ padding: '4px 10px', textAlign: 'right' }}>{formatCurrency(summary.subtotal8)}</td>
                <td style={{ padding: '4px 10px', textAlign: 'right', color: '#444' }}>
                  （消費税 {formatCurrency(summary.tax8)}）
                </td>
              </tr>
              <tr>
                <td style={{ padding: '4px 10px', color: '#444' }}>10%対象</td>
                <td style={{ padding: '4px 10px', textAlign: 'right' }}>{formatCurrency(summary.subtotal10)}</td>
                <td style={{ padding: '4px 10px', textAlign: 'right', color: '#444' }}>
                  （消費税 {formatCurrency(summary.tax10)}）
                </td>
              </tr>
              <tr style={{ borderTop: '2px solid #111' }}>
                <td style={{ padding: '6px 10px', fontWeight: 700 }}>合計（税込）</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }} colSpan={2}>
                  {formatCurrency(summary.grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 軽減税率注記 */}
        <p style={{ fontSize: '10px', color: '#666', margin: '0 0 16px' }}>★は軽減税率(8%)対象</p>

        {/* お振込先 */}
        <div style={{ border: '1px solid #111', padding: '10px 14px', marginBottom: '14px' }}>
          <p style={{ margin: 0, fontSize: '12px', fontWeight: 500 }}>お振込先</p>
          <p style={{ margin: '4px 0 0', fontSize: '12px' }}>{BANK.bank}</p>
          <p style={{ margin: 0, fontSize: '12px' }}>{BANK.account}</p>
          <p style={{ margin: 0, fontSize: '12px' }}>{BANK.holder}</p>
        </div>

        {/* フッター定型文 */}
        <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>
          お振込手数料は御社にてご負担いただけますようお願い申し上げます。
        </p>
      </div>
    </>
  )
}
