/** Username rule: last name then first name, lowercase letters and digits only (Maya Santos -> santosmaya). */
const clean = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export function makeUsername(firstName: string, lastName: string): string {
  return clean(lastName) + clean(firstName);
}

/** Adds 2, 3, ... until the username is not in `taken`. */
export function uniqueUsername(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(base + i)) return base + i;
  return base + Date.now();
}

/** What a student types at sign-in is normalized the same way, so "Santos Maya" and "santosmaya" both work. */
export const normalizeUsername = (typed: string): string => clean(typed);
