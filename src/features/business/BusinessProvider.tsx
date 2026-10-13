import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Permission } from '@/lib/permissions'
import { useAuth } from '@/features/auth/AuthProvider'
import { getBusinessContext, listMyBusinesses } from './api'
import type { BusinessContext, BusinessSummary } from './types'

const STORAGE_KEY = 'msme.business'

function readStored(): string | null {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}
function writeStored(id: string | null) {
  try { if (id) localStorage.setItem(STORAGE_KEY, id); else localStorage.removeItem(STORAGE_KEY) } catch { /* private mode */ }
}

interface BusinessState {
  /** null until loaded */
  businesses: BusinessSummary[] | null
  current: BusinessContext | null
  loading: boolean
  error: unknown
  select: (id: string) => void
  reload: () => Promise<void>
  /** UI hint only — the database enforces every permission. */
  can: (perm: Permission) => boolean
  /** False when the trial has expired or the account is suspended (database refuses writes). */
  writable: boolean
}

const Ctx = createContext<BusinessState | null>(null)

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id
  const [businesses, setBusinesses] = useState<BusinessSummary[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(readStored)
  const [current, setCurrent] = useState<BusinessContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(async () => {
    if (!userId) {
      setBusinesses(null)
      setCurrent(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await listMyBusinesses()
      setBusinesses(list)
      // Keep the stored choice only if the user still belongs to it; auto-pick when there is exactly one.
      let id = selectedId && list.some((b) => b.business_id === selectedId) ? selectedId : null
      if (!id && list.length === 1) id = list[0].business_id
      if (id !== selectedId) {
        setSelectedId(id)
        writeStored(id)
      }
      setCurrent(id ? await getBusinessContext(id) : null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [userId, selectedId])

  useEffect(() => { void load() }, [load])

  const value = useMemo<BusinessState>(() => {
    const perms = new Set(current?.permissions ?? [])
    const state = current?.subscription.access_state
    return {
      businesses,
      current,
      loading,
      error,
      select: (id) => {
        writeStored(id)
        setCurrent(null)
        setSelectedId(id)
      },
      reload: load,
      can: (p) => perms.has(p),
      writable: state === 'trialing' || state === 'active',
    }
  }, [businesses, current, loading, error, load])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBusiness() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useBusiness must be used inside BusinessProvider')
  return v
}

/** For pages rendered inside RequireBusiness, where a business is guaranteed. */
export function useCurrentBusiness() {
  const b = useBusiness()
  if (!b.current) throw new Error('No business selected')
  return { ...b, current: b.current }
}
