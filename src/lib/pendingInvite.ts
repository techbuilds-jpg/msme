/**
 * Invitation tokens arrive in the URL fragment (/invite#token). The invitee often has to sign up and verify their
 * email first, and the verification link opens in a NEW tab — so the token is kept in localStorage (shared across
 * tabs), not sessionStorage. It is dropped once accepted, or after 7 days (when the invitation expires anyway).
 */
const KEY = 'msme.pendingInvite'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const TOKEN = /^[a-f0-9]{64}$/

export function savePendingInvite(token: string) {
  if (!TOKEN.test(token)) return
  try { localStorage.setItem(KEY, JSON.stringify({ token, savedAt: Date.now() })) } catch { /* storage unavailable */ }
}

export function getPendingInvite(): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const { token, savedAt } = JSON.parse(raw) as { token: string; savedAt: number }
    if (!TOKEN.test(token) || Date.now() - savedAt > MAX_AGE_MS) { localStorage.removeItem(KEY); return null }
    return token
  } catch { return null }
}

export function clearPendingInvite() {
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}
