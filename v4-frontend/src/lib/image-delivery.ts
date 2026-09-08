export const imageVariant = (source: string | null | undefined, width: number) => {
  if (!source) return undefined;

  try {
    const url = new URL(source);

    if (url.hostname === 'commons.wikimedia.org' && url.pathname.includes('/wiki/Special:Redirect/file/')) {
      url.searchParams.set('width', String(width));
      return url.toString();
    }

    if (url.hostname === 'upload.wikimedia.org') {
      const filename = decodeURIComponent(url.pathname.split('/').pop() || '');
      if (filename) {
        return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}?width=${width}`;
      }
    }

    if (url.hostname === 'images.pexels.com') {
      url.searchParams.set('auto', 'compress');
      url.searchParams.set('cs', 'tinysrgb');
      url.searchParams.set('w', String(width));
      url.searchParams.delete('h');
      url.searchParams.delete('dpr');
      return url.toString();
    }
  } catch {
    return source;
  }

  return source;
};

export const imageSrcSet = (source: string | null | undefined, widths: number[]) => {
  if (!source) return undefined;
  const variants = widths.map((width) => ({ width, url: imageVariant(source, width) }));
  const uniqueUrls = new Set(variants.map((item) => item.url));
  if (uniqueUrls.size <= 1) return undefined;
  return variants.map((item) => `${item.url} ${item.width}w`).join(', ');
};
