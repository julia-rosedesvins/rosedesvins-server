import { slugify } from './slug.util';

/** Short SEO slugs → canonical region slugs stored in MongoDB. */
export const REGION_SLUG_ALIASES: Record<string, string> = {
    corse: 'vin-de-corse-ou-corse',
    corsica: 'vin-de-corse-ou-corse',
};

export function resolveRegionSlugAlias(slug: string): string {
    const normalized = slug.trim().toLowerCase();
    return REGION_SLUG_ALIASES[normalized] ?? normalized;
}

/**
 * Match a free-text region query (e.g. "corse") to a parent wine region denom.
 */
export function regionDenomMatchesShortName(denom: string, query: string): boolean {
    const normalizedQuery = query.trim().toLowerCase().replace(/-/g, ' ');
    if (!normalizedQuery || normalizedQuery.length < 3) return false;

    const normalizedDenom = denom.trim().toLowerCase();
    if (normalizedDenom === normalizedQuery) return true;

    const slugFromDenom = slugify(denom);
    if (slugFromDenom === normalizedQuery.replace(/\s+/g, '-')) return true;

    const wordPattern = new RegExp(`\\b${normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return wordPattern.test(denom);
}
