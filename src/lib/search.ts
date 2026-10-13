/** Makes user text safe inside a PostgREST `or=(…ilike…)` filter: drops characters with filter meaning. */
export function searchTerm(input: string): string | null {
  const t = input.replace(/[%*,()\\:."']/g, ' ').trim().slice(0, 60)
  return t ? `*${t}*` : null
}

export const LIST_LIMIT = 200
