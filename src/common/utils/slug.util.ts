/**
 * Convert arbitrary text (region/domain names, including accents, apostrophes
 * and existing hyphens) into a URL-safe, lowercase, hyphenated slug.
 *
 * Examples:
 *   "Côtes d'Auvergne"     -> "cotes-d-auvergne"
 *   "Châteauneuf-du-Pape"  -> "chateauneuf-du-pape"
 *   "Domaine de Vodanis"   -> "domaine-de-vodanis"
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Append -2, -3, ... to `base` until `isTaken` reports the candidate is free.
 * `isTaken` should check uniqueness across every collection that shares the
 * same URL namespace (e.g. DomainProfile + StaticExperience slugs).
 */
export async function ensureUniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const fallback = base || 'item';
  let candidate = fallback;
  let suffix = 2;

  while (await isTaken(candidate)) {
    candidate = `${fallback}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}
