'use client'

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DraggableAttributes } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import { CSS } from '@dnd-kit/utilities'
import type { Category, Product, PriceRank } from '@/types'
import { formatCurrency } from '@/lib/utils'

interface CategorySectionProps {
  category: Category
  products: Product[]
  dragHandle: { attributes: DraggableAttributes; listeners: SyntheticListenerMap | undefined }
  onProductReorder: (categoryId: string, reordered: Product[]) => void
  onEdit: (product: Product) => void
  onToggleActive: (product: Product) => void
  onPricingTiers: (product: Product) => void
}

function SortableProductRow({
  product,
  categoryEmoji,
  onEdit,
  onToggleActive,
  onPricingTiers,
}: {
  product: Product
  categoryEmoji: string
  onEdit: (p: Product) => void
  onToggleActive: (p: Product) => void
  onPricingTiers: (p: Product) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const standardPrice = product.product_prices?.find((pp) => pp.price_rank === ('standard' as PriceRank))
  const hasTiers = (product.pricing_tiers?.length ?? 0) > 0

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-3">
      {/* ドラッグハンドル */}
      <span
        {...attributes}
        {...listeners}
        className="text-gray-300 cursor-grab active:cursor-grabbing select-none touch-none text-xl leading-none px-1"
      >
        ≡
      </span>

      {/* サムネ */}
      <div className="w-10 h-10 flex-shrink-0 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center text-lg">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          categoryEmoji || '📦'
        )}
      </div>

      {/* 商品情報 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            product.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
          }`}>
            {product.is_active ? '販売中' : '非表示'}
          </span>
          {hasTiers && (
            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
              段階あり
            </span>
          )}
        </div>
        <p className="font-medium text-gray-900 text-sm mt-0.5 truncate">{product.name}</p>
        {standardPrice && !hasTiers && (
          <p className="text-xs text-green-700">{formatCurrency(standardPrice.price_per_unit)}/{product.unit}</p>
        )}
        {hasTiers && (
          <p className="text-xs text-purple-600">{product.pricing_tiers!.length}段階</p>
        )}
      </div>

      {/* 操作ボタン */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onPricingTiers(product)}
          className="text-xs font-medium px-2 py-1 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors"
        >
          価格段階
        </button>
        <button
          onClick={() => onToggleActive(product)}
          className={`text-xs font-medium px-2 py-1 rounded-lg border transition-colors ${
            product.is_active
              ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
              : 'border-green-200 text-green-600 hover:bg-green-50'
          }`}
        >
          {product.is_active ? '非表示' : '表示'}
        </button>
        <button
          onClick={() => onEdit(product)}
          className="text-xs font-medium px-2 py-1 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
        >
          編集
        </button>
      </div>
    </div>
  )
}

export default function CategorySection({
  category,
  products,
  dragHandle,
  onProductReorder,
  onEdit,
  onToggleActive,
  onPricingTiers,
}: CategorySectionProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = products.findIndex((p) => p.id === active.id)
    const newIndex = products.findIndex((p) => p.id === over.id)
    const reordered = arrayMove(products, oldIndex, newIndex)
    onProductReorder(category.id, reordered)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {/* カテゴリヘッダー */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
        <span
          {...(dragHandle.attributes as React.HTMLAttributes<HTMLSpanElement>)}
          {...(dragHandle.listeners as React.HTMLAttributes<HTMLSpanElement>)}
          className="text-gray-300 cursor-grab active:cursor-grabbing select-none touch-none text-xl leading-none"
        >
          ≡
        </span>
        <span className="text-lg">{category.emoji || '📦'}</span>
        <h3 className="font-bold text-gray-900">{category.name}</h3>
        <span className="text-sm text-gray-400">（{products.length}品目）</span>
      </div>

      {/* 商品リスト */}
      <div className="p-3">
        {products.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">商品がありません</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={products.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {products.map((product) => (
                  <SortableProductRow
                    key={product.id}
                    product={product}
                    categoryEmoji={category.emoji || '📦'}
                    onEdit={onEdit}
                    onToggleActive={onToggleActive}
                    onPricingTiers={onPricingTiers}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}
