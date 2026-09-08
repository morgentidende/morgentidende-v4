// External client script so CSP can forbid inline executable JavaScript.
const root = document.documentElement;
const saved = localStorage.getItem('mt-v4-theme');
if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  localStorage.setItem('mt-v4-theme', next);
});

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
