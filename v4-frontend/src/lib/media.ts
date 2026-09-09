const SITE_ORIGIN = 'https://morgentidende.dk';
const MANAGED_MEDIA_HOSTS = new Set(['media.morgentidende.dk']);

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
  { quality = 82, fit = 'cover' }: { quality?: number; fit?: 'cover' | 'contain' | 'scale-down' } = {}
) => {
  if (!isManagedMediaUrl(src)) return src;
  const absoluteSource = new URL(src, SITE_ORIGIN).toString();
  return `/cdn-cgi/image/width=${width},fit=${fit},format=auto,quality=${quality}/${absoluteSource}`;
};

export const responsiveImage = (
  src?: string | null,
  widths: number[] = [320, 480, 640, 960, 1280]
) => {
  if (!src) return { src: '', srcset: undefined as string | undefined };
  if (!isManagedMediaUrl(src)) return { src, srcset: undefined as string | undefined };

  const uniqueWidths = Array.from(new Set(widths)).filter((width) => width > 0).sort((a, b) => a - b);
  const largest = uniqueWidths.at(-1) || 1280;
  return {
    src: cloudflareImageUrl(src, largest),
    srcset: uniqueWidths.map((width) => `${cloudflareImageUrl(src, width)} ${width}w`).join(', ')
  };
};
