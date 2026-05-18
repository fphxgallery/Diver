const cache = new Map<string, string | null>();

export async function getTokenLogoUri(mint: string): Promise<string | null> {
  if (cache.has(mint)) return cache.get(mint)!;

  try {
    const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`);
    if (!res.ok) { cache.set(mint, null); return null; }
    const data = await res.json() as { icon?: string }[];
    const token = data.find((t) => (t as { id?: string }).id === mint) ?? data[0];
    const logo = token?.icon ?? null;
    cache.set(mint, logo);
    return logo;
  } catch {
    cache.set(mint, null);
    return null;
  }
}
