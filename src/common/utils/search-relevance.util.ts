export function normalizeSearchText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/['\u2019\u2018]/g, ' ')
        .toLowerCase()
        .replace(/\b(le|la|les|des|de|du|d|l|au|aux|en|et|un|une)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function scoreNormalizedCandidate(query: string, candidate: string): number {
    const q = normalizeSearchText(query);
    const c = normalizeSearchText(candidate);
    if (!q || !c) return 0;

    if (c === q) return 1000;

    const qTokens = q.split(/\s+/).filter(Boolean);
    const cTokens = c.split(/\s+/).filter(Boolean);

    if (qTokens.length === 1 && cTokens.includes(q)) return 950;
    if (c.startsWith(q)) return 900;
    if (qTokens.every((token) => cTokens.some((ct) => ct.startsWith(token)))) return 850;
    if (c.includes(q)) return 700;
    if (qTokens.every((token) => c.includes(token))) return 600;

    const matchedTokens = qTokens.filter((token) =>
        cTokens.some((ct) => ct.includes(token) || token.includes(ct)),
    ).length;
    if (matchedTokens > 0) {
        return 200 + Math.round((matchedTokens / qTokens.length) * 200);
    }

    return 0;
}

export function scoreSearchMatch(
    query: string,
    candidate: string,
    slug?: string | null,
): number {
    const candidates = [candidate, slug?.replace(/-/g, ' ')].filter(Boolean) as string[];
    return Math.max(0, ...candidates.map((value) => scoreNormalizedCandidate(query, value)));
}

export function compareSearchMatch(
    query: string,
    aName: string,
    bName: string,
    aSlug?: string | null,
    bSlug?: string | null,
): number {
    return scoreSearchMatch(query, bName, bSlug) - scoreSearchMatch(query, aName, aSlug);
}
