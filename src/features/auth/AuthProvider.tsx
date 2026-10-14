import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

export interface Profile {
  id: string
  email: string | null
  full_name: string
  phone: string | null
  trial_used_at: string | null
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  isPlatformAdmin: boolean
  emailVerified: boolean
  /** Signed in anonymously for the demo sandbox. */
  isAnonymous: boolean
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (s: Session | null) => {
    setSession(s)
    if (!s) {
      setProfile(null)
      setIsPlatformAdmin(false)
      setLoading(false)
      return
    }
    const [p, a] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, phone, trial_used_at').eq('id', s.user.id).maybeSingle(),
      supabase.from('platform_admins').select('user_id').eq('user_id', s.user.id).maybeSingle(),
    ])
    setProfile((p.data as Profile) ?? null)
    setIsPlatformAdmin(!!a.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'TOKEN_REFRESHED') setSession(s)
      else setTimeout(() => void load(s), 0) // never await Supabase calls inside the auth callback
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const value = useMemo<AuthState>(() => ({
    session,
    profile,
    isPlatformAdmin,
    emailVerified: !!session?.user.email_confirmed_at,
    isAnonymous: !!session?.user.is_anonymous,
    loading,
    refresh: async () => {
      const { data } = await supabase.auth.getSession()
      await load(data.session)
    },
    signOut: async () => {
      await supabase.auth.signOut()
      localStorage.removeItem('msme.business')
      await load(null)
    },
  }), [session, profile, isPlatformAdmin, loading, load])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
