/**
 * Turns Supabase/Postgres errors into messages a business owner can act on.
 * Custom SQLSTATE codes are raised by the database functions (see supabase/migrations).
 */
export class AppError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
  }
}

const FRIENDLY: Record<string, string> = {
  '42501': 'You do not have permission to do this.',
  '23505': 'This record already exists.',
  '23503': 'This refers to a record that does not exist in this business.',
  '23514': 'Some values are not valid. Please check the form.',
  RL001: 'Too many attempts. Please wait a moment and try again.',
}

/** Codes whose database message is already written for end users. */
const PASS_THROUGH = new Set(['TR001', 'TR002', 'TR003', 'TR004', 'TR005', 'P0002', '42501', '22023', 'RL001'])

export function toAppError(err: { message: string; code?: string } | null | undefined): AppError {
  if (!err) return new AppError('Unknown error')
  const code = err.code
  if (code && PASS_THROUGH.has(code) && err.message) return new AppError(err.message, code)
  if (code && FRIENDLY[code]) return new AppError(FRIENDLY[code], code)
  return new AppError(err.message || 'Something went wrong', code)
}

/** Throws a friendly error when a Supabase call failed, otherwise returns its data. */
export function unwrap<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw toAppError(res.error)
  return res.data as T
}

export const isTrialBlock = (e: unknown) => e instanceof AppError && ['TR001', 'TR002', 'TR003', 'TR004'].includes(e.code ?? '')
