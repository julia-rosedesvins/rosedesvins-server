export function buildFullMediaUrl(
    url: string | undefined | null,
    backendUrl: string,
): string | null {
    if (!url) return null;

    const trimmed = url.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
    }

    if (trimmed.startsWith('//')) {
        return `https:${trimmed}`;
    }

    const base = backendUrl.replace(/\/+$/, '');
    return `${base}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}
