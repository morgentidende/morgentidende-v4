// External client script so CSP can forbid inline executable JavaScript.
const root = document.documentElement;
const saved = localStorage.getItem('mt-v4-theme');
if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  localStorage.setItem('mt-v4-theme', next);
});

const dateEl = document.getElementById('v4-date');
if (dateEl) {
  dateEl.textContent = new Intl.DateTimeFormat('da-DK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date()).toUpperCase();
}

const lower = document.querySelector('.v4-masthead-lower');
const topbar = document.querySelector('.v4-masthead-top');
const brand = document.querySelector('.v4-masthead-top .v4-brand');

if (lower && topbar) {
  let ticking = false;
  let lowerHeight = lower.getBoundingClientRect().height;
  let scrollDistance = lowerHeight;

  const updateMeasurements = () => {
    lowerHeight = lower.getBoundingClientRect().height;
    if (window.innerWidth <= 640) {
      scrollDistance = 140;
    } else if (window.innerWidth <= 900) {
      scrollDistance = 110;
    } else {
      scrollDistance = lowerHeight;
    }
  };

  const render = () => {
    const progress = Math.min(1, Math.max(0, window.scrollY / scrollDistance));
    const travel = lowerHeight * progress;
    lower.style.transform = `translate3d(0, ${-travel}px, 0)`;
    lower.style.pointerEvents = progress >= .999 ? 'none' : 'auto';

    if (brand) {
      const maxScaleChange = window.innerWidth <= 640 ? 0.06 : 0.12;
      const scale = 1 - (maxScaleChange * progress);
      brand.style.transform = `scale(${scale})`;
    }

    topbar.style.boxShadow = progress > .02
      ? `0 8px 22px rgb(8 14 22 / ${0.16 * progress})`
      : 'none';
    ticking = false;
  };

  const requestRender = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(render);
    }
  };

  const measure = () => {
    updateMeasurements();
    requestRender();
  };

  updateMeasurements();
  render();
  window.addEventListener('scroll', requestRender, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('load', measure, { once: true });
}

document.querySelectorAll('[data-newsletter-form]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const status = form.querySelector('[data-newsletter-status]');
    if (status) {
      status.textContent = 'Tak – formularen er klar, og tilmeldingen åbner før lanceringen.';
    }
  });
});

// Article sharing lives here because the site CSP blocks inline executable JavaScript.
document.querySelectorAll('.v4-copy-link').forEach((button) => {
  button.addEventListener('click', async () => {
    const url = button.dataset.copyLink || window.location.href;
    const label = button.querySelector('.v4-copy-label');

    const showCopied = () => {
      if (!label) return;
      label.textContent = 'Link kopieret';
      window.setTimeout(() => {
        label.textContent = 'Kopier link';
      }, 1800);
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        showCopied();
        return;
      }
    } catch {
      // Fall through to the legacy copy method below.
    }

    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    textarea.remove();

    if (copied) {
      showCopied();
    } else {
      window.prompt('Kopier link:', url);
    }
  });
});

// Google News transparency: use the publication itself as the visible byline
// when an article has no separately named human author.
const articleMeta = document.querySelector('.v4-article-meta');
if (articleMeta && !articleMeta.querySelector('span')) {
  const byline = document.createElement('span');
  byline.textContent = 'Af Morgentidende';
  articleMeta.prepend(byline);
}

// Turn explicit editorial YouTube links into privacy-enhanced responsive embeds.
// Only links whose visible text starts with "Se video:" are transformed.
document.querySelectorAll('.v4-article-body a').forEach((link) => {
  const label = (link.textContent || '').trim();
  if (!label.toLocaleLowerCase('da-DK').startsWith('se video:')) return;

  let url;
  try {
    url = new URL(link.href);
  } catch {
    return;
  }

  let videoId = '';
  if (url.hostname === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] || '';
  } else if (url.hostname.endsWith('youtube.com')) {
    videoId = url.searchParams.get('v') || '';
    if (!videoId && url.pathname.startsWith('/shorts/')) videoId = url.pathname.split('/')[2] || '';
    if (!videoId && url.pathname.startsWith('/embed/')) videoId = url.pathname.split('/')[2] || '';
  }

  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return;

  const frame = document.createElement('div');
  frame.className = 'v4-video-embed';
  frame.style.cssText = 'position:relative;width:100%;aspect-ratio:16/9;margin:2rem 0;overflow:hidden;border-radius:14px;background:#000;';

  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}`;
  iframe.title = label.replace(/^Se video:\s*/i, '') || 'Video';
  iframe.loading = 'lazy';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.allowFullscreen = true;
  iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;';

  frame.appendChild(iframe);
  const paragraph = link.closest('p');
  (paragraph || link).replaceWith(frame);
});
