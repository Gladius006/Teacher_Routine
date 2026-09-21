/** Must match USER_EMAIL_DOMAIN in supabase/functions/admin-users/index.ts. */
export const USER_EMAIL_DOMAIN = 'users.example.com'

const USERNAME = /^[a-z0-9._-]{3,32}$/

export const normalizeUsername = (u: string) => u.trim().toLowerCase()

/** Returns a message if the user ID is not allowed, otherwise undefined. */
export function usernameError(u: string): string | undefined {
  const n = normalizeUsername(u)
  if (!n) return 'Enter a user ID.'
  if (!USERNAME.test(n)) return 'Use 3 to 32 letters, numbers, dots, dashes or underscores.'
  return undefined
}

export function passwordError(p: string): string | undefined {
  if (!p) return 'Enter a password.'
  if (p.length < 8) return 'Use at least 8 characters.'
  return undefined
}

/** Supabase Auth signs in with an email, so each user ID maps to an address that is never mailed. */
export const usernameToEmail = (u: string) => `${normalizeUsername(u)}@${USER_EMAIL_DOMAIN}`
