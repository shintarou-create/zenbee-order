import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Order } from '@/types'
import { formatCurrency, formatDate } from './utils'

// jsPDFのAutoTableの型拡張
declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: {
      finalY: number
    }
  }
}

export function generateInvoicePDF(order: Order): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  // フォント設定（標準フォントを使用 - 日本語は基本的に文字化けするため
  // 実際の本番環境ではNotoSansJP等のフォントを埋め込む必要がある）
  doc.setFont('helvetica')

  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20

  // ============================================================
  // ヘッダー
  // ============================================================
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('Delivery Note / \u7d0d\u54c1\u66f8', pageWidth / 2, 25, { align: 'center' })

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('\u5584\u5175\u885b\u8fb2\u56ed (Zenbee Farm)', pageWidth / 2, 32, { align: 'center' })

  // 区切り線
  doc.setLineWidth(0.5)
  doc.line(margin, 38, pageWidth - margin, 38)

  // ============================================================
  // 注文情報
  // ============================================================
  let y = 46

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('\u6ce8\u6587\u756a\u53f7 (Order No.):', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(order.order_number, margin + 50, y)

  y += 7
  doc.setFont('helvetica', 'bold')
  doc.text('\u767a\u6ce8\u65e5 (Order Date):', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(order.created_at), margin + 50, y)

  if (order.shipping_date) {
    y += 7
    doc.setFont('helvetica', 'bold')
    doc.text('\u767a\u9001\u65e5 (Ship Date):', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.text(formatDate(order.shipping_date), margin + 50, y)
  }

  if (order.delivery_date) {
    y += 7
    doc.setFont('helvetica', 'bold')
    doc.text('\u304a\u5c4a\u3051\u4e88\u5b9a\u65e5 (Delivery Date):', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.text(formatDate(order.delivery_date), margin + 50, y)
  }

  // お届け先情報
  if (order.company) {
    y += 12
    doc.setFont('helvetica', 'bold')
    doc.text('\u304a\u5c4a\u3051\u5148 (Ship To):', margin, y)

    y += 7
    doc.setFont('helvetica', 'normal')
    const company = order.company
    const addressLines = [
      company.company_name,
      company.representative_name || '',
      `\u3012${company.postal_code || ''}`,
      [company.prefecture, company.city, company.address, company.building]
        .filter(Boolean)
        .join(''),
      company.phone ? `TEL: ${company.phone}` : '',
    ].filter(Boolean)

    for (const line of addressLines) {
      doc.text(line, margin + 5, y)
      y += 6
    }
  }

  y += 5
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  // ============================================================
  // 明細テーブル
  // ============================================================
  const items = order.order_items || []

  autoTable(doc, {
    startY: y,
    head: [
      [
        '\u5546\u54c1\u540d (Item)',
        '\u6570\u91cf (Qty)',
        '\u5358\u4f4d (Unit)',
        '\u5358\u4fa1 (Unit Price)',
        '\u5c0f\u8a08 (Subtotal)',
      ],
    ],
    body: items.map((item) => [
      item.product_name,
      item.quantity.toString(),
      item.unit,
      formatCurrency(item.unit_price),
      formatCurrency(item.subtotal),
    ]),
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [22, 163, 74],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [240, 253, 244],
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 25, halign: 'right' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 35, halign: 'right' },
    },
    margin: { left: margin, right: margin },
  })

  // ============================================================
  // 合計金額
  // ============================================================
  const finalY = doc.lastAutoTable.finalY + 10
  const taxRate = 0.08 // 農産物は8%軽減税率
  const taxExcluded = Math.floor(order.total_amount / (1 + taxRate))
  const taxAmount = order.total_amount - taxExcluded

  doc.setFontSize(10)

  const rightAlignX = pageWidth - margin
  let totalY = finalY

  doc.setFont('helvetica', 'normal')
  doc.text('\u5c0f\u8a08 (Subtotal):', rightAlignX - 60, totalY)
  doc.text(formatCurrency(taxExcluded), rightAlignX, totalY, { align: 'right' })

  totalY += 7
  doc.text('\u6d88\u8cbb\u7a0e (Tax 8%):', rightAlignX - 60, totalY)
  doc.text(formatCurrency(taxAmount), rightAlignX, totalY, { align: 'right' })

  totalY += 2
  doc.setLineWidth(0.5)
  doc.line(rightAlignX - 70, totalY + 2, rightAlignX, totalY + 2)
  totalY += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('\u5408\u8a08 (Total):', rightAlignX - 60, totalY)
  doc.text(formatCurrency(order.total_amount), rightAlignX, totalY, { align: 'right' })

  // ============================================================
  // 備考
  // ============================================================
  if (order.notes) {
    totalY += 15
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('\u5099\u8003 (Notes):', margin, totalY)
    doc.setFont('helvetica', 'normal')
    totalY += 6
    doc.text(order.notes, margin, totalY)
  }

  // ============================================================
  // フッター
  // ============================================================
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(150)
  doc.text(
    '\u5584\u5175\u885b\u8fb2\u56ed | \u548c\u6b4c\u5c71\u770c\u6709\u7530\u90e1\u6e6f\u6d45\u753a\u7530 340-3 | TEL: 0737-62-xxxx',
    pageWidth / 2,
    pageHeight - 10,
    { align: 'center' }
  )
  doc.setTextColor(0)

  // PDFをダウンロード
  doc.save(`delivery_note_${order.order_number}.pdf`)
}
