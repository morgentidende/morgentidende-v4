const SITE_ORIGIN = 'https://morgentidende.dk';
const MANAGED_MEDIA_HOSTS = new Set(['media.morgentidende.dk']);

type CloudflareImageOptions = {
  quality?: number;
  fit?: 'cover' | 'contain' | 'scale-down';
  height?: number;
  gravity?: 'face' | 'auto' | 'center';
  zoom?: number;
};

export const isManagedMediaUrl = (src?: string | null) => {
  if (!src) return false;
  try {
    const url = new URL(src, SITE_ORIGIN);
    return MANAGED_MEDIA_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
};

export const cloudflareImageUrl = (
  src: string,
  width: number,
  { quality = 82, fit = 'cover', height, gravity, zoom }: CloudflareImageOptions = {}
) => {
  if (!isManagedMediaUrl(src)) return src;
  const absoluteSource = new URL(src, SITE_ORIGIN).toString();
  const options = [
    `width=${Math.round(width)}`,
    height ? `height=${Math.round(height)}` : null,
    `fit=${fit}`,
    gravity && gravity !== 'center' ? `gravity=${gravity}` : null,
    typeof zoom === 'number' ? `zoom=${Math.max(0, Math.min(1, zoom))}` : null,
    'format=auto',
    `quality=${quality}`
  ].filter(Boolean).join(',');
  return `/cdn-cgi/image/${options}/${absoluteSource}`;
};

export const responsiveImage = (
  src?: string | null,
  widths: number[] = [320, 480, 640, 960, 1280],
  options: CloudflareImageOptions = {}
) => {
  if (!src) return { src: '', srcset: undefined as string | undefined };
  if (!isManagedMediaUrl(src)) return { src, srcset: undefined as string | undefined };

  const uniqueWidths = Array.from(new Set(widths)).filter((width) => width > 0).sort((a, b) => a - b);
  const largest = uniqueWidths.at(-1) || 1280;
  const heightFor = (width: number) => options.height
    ? Math.round(width * (options.height / largest))
    : undefined;
  return {
    src: cloudflareImageUrl(src, largest, { ...options, height: heightFor(largest) }),
    srcset: uniqueWidths.map((width) => `${cloudflareImageUrl(src, width, { ...options, height: heightFor(width) })} ${width}w`).join(', ')
  };
};

export const responsiveHeroCrop = (
  src?: string | null,
  widths: number[] = [480, 720, 980, 1280, 1600],
  { gravity = 'face', zoom = 0 }: { gravity?: 'face' | 'auto'; zoom?: number } = {}
) => {
  const validWidths = widths.filter((width) => width > 0);
  const largest = validWidths.length ? Math.max(...validWidths) : 980;
  return responsiveImage(src, widths, {
    fit: 'cover',
    height: Math.round(largest * 2 / 3),
    gravity,
    zoom
  });
};
