import type { ReactNode } from 'react'
import { useCurrentBusiness } from '@/features/business/BusinessProvider'
import type { Permission } from '@/lib/permissions'

/**
 * Renders write controls only when the member has `perm` and the business accepts writes (trial active).
 * This is a UI convenience — the database refuses the write either way.
 */
export function CanWrite({ perm, children, fallback = null }: { perm: Permission; children: ReactNode; fallback?: ReactNode }) {
  const { can, writable } = useCurrentBusiness()
  return <>{can(perm) && writable ? children : fallback}</>
}

export function useCanWrite(perm: Permission) {
  const { can, writable } = useCurrentBusiness()
  return can(perm) && writable
}
