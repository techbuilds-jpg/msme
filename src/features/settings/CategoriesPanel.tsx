import { useState } from 'react'
import { Alert, Badge, Button, Card, Input, errorMessage } from '@/components/ui'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import { addCategory, listCategories } from '@/features/expenses/api'
import { useAsync } from '@/lib/useAsync'
import { updateCategory } from './api'

export function CategoriesPanel() {
  const { current, writable } = useCurrentBusiness()
  const bid = current.business.id
  const { data, error: loadError, reload } = useAsync(() => listCategories(bid), [bid])
  const [names, setNames] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try { await fn(); await reload() } catch (e) { setError(errorMessage(e)) }
  }

  return (
    <Card className="max-w-2xl" title="Expense categories">
      <p className="mb-3 text-sm text-slate-600">Rename or hide categories. Hidden categories keep their past expenses but can't be picked for new ones.</p>
      {(error || !!loadError) && <Alert tone="error" className="mb-3">{error ?? errorMessage(loadError)}</Alert>}
      <ul className="divide-y divide-slate-100">
        {data?.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
            <input className="input max-w-xs flex-1" aria-label={`Category name ${c.name}`} maxLength={60} disabled={!writable}
              value={names[c.id] ?? c.name} onChange={(e) => setNames({ ...names, [c.id]: e.target.value })} />
            {!c.is_active && <Badge>Hidden</Badge>}
            {writable && <>
              {names[c.id] !== undefined && names[c.id].trim() && names[c.id] !== c.name && (
                <Button size="sm" onClick={() => void run(async () => { await updateCategory(c.id, { name: names[c.id].trim() }); setNames((n) => { const x = { ...n }; delete x[c.id]; return x }) })}>Rename</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => void run(() => updateCategory(c.id, { is_active: !c.is_active }))}>{c.is_active ? 'Hide' : 'Show'}</Button>
            </>}
          </li>
        ))}
      </ul>
      {writable && (
        <div className="mt-4 flex items-end gap-2">
          <Input label="New category" wrapperClassName="max-w-xs flex-1" maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button disabled={!newName.trim()} onClick={() => void run(async () => { await addCategory(bid, newName, (data?.length ?? 0) + 1); setNewName('') })}>Add</Button>
        </div>
      )}
    </Card>
  )
}
