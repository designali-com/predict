/**
 * A string, always.
 *
 * Route handlers were passing whatever they caught straight into
 * NextResponse.json, so a thrown value that would not serialize turned a
 * handled failure into an unhandled one — and the caller, which does
 * `await res.json()`, got Next's HTML error page and reported
 * "Unexpected token '<'". An error nobody can read is barely better than none.
 */
export function describeError(error: unknown, fallback = "Something went wrong"): string {
  const body = (error as { body?: { message?: unknown } })?.body?.message
  if (typeof body === "string" && body) return body

  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error) return error

  // Some SDKs reject with a plain object rather than an
  // Error, so `instanceof` misses them and the message ends up buried inside
  // a JSON dump of the whole rejection.
  const message = (error as { message?: unknown })?.message
  if (typeof message === "string" && message) return message

  try {
    const json = JSON.stringify(error)
    return json && json !== "{}" ? json : fallback
  } catch {
    return fallback
  }
}
