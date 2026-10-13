import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Alert, Badge, Button, Card, Checkbox, DataTable, EmptyState, Input, Modal, Select, errorMessage } from '@/components/ui'
import { CanWrite } from '@/components/shared/ReadOnlyGuard'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { formatMoney, parseMoney } from '@/lib/money'
import { useAsync } from '@/lib/useAsync'
import { listCatalog, saveCatalogItem, type CatalogItem } from './api'

export function CatalogPanel() {
  const { current } = useCurrentBusiness()
  const b = current.business
  const { data, loading, error, reload } = useAsync(() => listCatalog(b.id), [b.id])
  const [editing, setEditing] = useState<Partial<CatalogItem> | null>(null)

  return (
    <Card padded={false}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-3">
        <p className="text-sm text-slate-600">Products and services you sell often. Pick them when creating orders and sales.</p>
        <CanWrite perm="sales.manage"><Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing({ kind: 'service', is_active: true })}>Add item</Button></CanWrite>
      </div>
      <DataTable rows={data} loading={loading} error={error} onRetry={reload} rowKey={(r) => r.id}
        onRowClick={(r) => setEditing(r)}
        empty={<EmptyState title="Your price list is empty" description="Optional: add the products and services you sell to speed up data entry." />}
        columns={[
          { header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span> },
          { header: 'Type', cell: (r) => <span className="capitalize">{r.kind}</span> },
          { header: 'SKU / code', cell: (r) => r.sku ?? '—' },
          { header: 'Price', className: 'text-right', cell: (r) => <span className="tabular-nums">{formatMoney(r.unit_price_centavos, b.currency)}</span> },
          { header: 'Status', cell: (r) => (r.is_active ? <Badge tone="green">Active</Badge> : <Badge>Hidden</Badge>) },
        ]} />
      {editing && <CatalogModal item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload() }} />}
    </Card>
  )
}

function CatalogModal({ item, onClose, onSaved }: { item: Partial<CatalogItem>; onClose: () => void; onSaved: () => void }) {
  const { current, can, writable } = useCurrentBusiness()
  const [name, setName] = useState(item.name ?? '')
  const [kind, setKind] = useState<CatalogItem['kind']>(item.kind ?? 'service')
  const [sku, setSku] = useState(item.sku ?? '')
  const [price, setPrice] = useState(item.unit_price_centavos != null ? (item.unit_price_centavos / 100).toFixed(2) : '')
  const [active, setActive] = useState(item.is_active ?? true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const editable = can('sales.manage') && writable

  const save = async () => {
    setError(null)
    const cents = parseMoney(price || '0')
    if (!name.trim()) return setError('Enter a name.')
    if (cents == null) return setError('Enter a valid price, e.g. 250 or 250.50.')
    setSaving(true)
    try {
      await saveCatalogItem(current.business.id, { id: item.id, name: name.trim(), kind, sku: sku.trim() || null, unit_price_centavos: cents, is_active: active })
      onSaved()
    } catch (e) { setError(errorMessage(e)); setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={item.id ? 'Price list item' : 'Add price list item'} size="sm"
      footer={editable ? <><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => void save()} loading={saving}>Save</Button></> : <Button variant="outline" onClick={onClose}>Close</Button>}>
      <fieldset disabled={!editable} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Name" required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Type" value={kind} onChange={(e) => setKind(e.target.value as CatalogItem['kind'])}>
          <option value="service">Service</option><option value="product">Product</option>
        </Select>
        <Input label="Price" inputMode="decimal" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Input label="SKU / code" hint="Optional" maxLength={60} value={sku} onChange={(e) => setSku(e.target.value)} />
        <Checkbox label="Show in pickers" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </fieldset>
    </Modal>
  )
}
