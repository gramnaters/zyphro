export function toSlug(title?: string | null): string {
  if (!title) return 'anime';
  const slug = title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'anime';
}

export function animeTitle(anime?: {
  title?: {
    english?: string | null;
    romaji?: string | null;
    userPreferred?: string | null;
  };
}): string {
  return (
    anime?.title?.english ||
    anime?.title?.romaji ||
    anime?.title?.userPreferred ||
    'Anime'
  );
}

export function watchPath(
  id: string | number,
  title?: string | null,
  episode?: string | number,
) {
  const slug = toSlug(title);
  const ep = episode ?? 1;
  return `/watch/${id}/${slug}?ep=${ep}`;
}

export function infoPath(id: string | number, title?: string | null) {
  return `/info/${id}/${toSlug(title)}`;
}
