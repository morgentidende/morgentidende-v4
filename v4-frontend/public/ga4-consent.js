(() => {
  const MEASUREMENT_ID = 'G-J4SQPTS3P5';
  const STORAGE_KEY = 'morgentidende_analytics_consent';
  const banner = document.querySelector('[data-analytics-consent]');
  const acceptButton = document.querySelector('[data-analytics-accept]');
  const rejectButton = document.querySelector('[data-analytics-reject]');
  const settingsButtons = document.querySelectorAll('[data-analytics-settings]');
  let analyticsLoaded = false;

  const getConsent = () => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  };

  const setConsent = (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // If storage is unavailable, keep the choice for this page only.
    }
  };

  const showBanner = () => {
    if (!banner) return;
    banner.hidden = false;
    document.documentElement.classList.add('has-analytics-consent-banner');
  };

  const hideBanner = () => {
    if (!banner) return;
    banner.hidden = true;
    document.documentElement.classList.remove('has-analytics-consent-banner');
  };

  const loadAnalytics = () => {
    if (analyticsLoaded) return;
    analyticsLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };

    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, {
      anonymize_ip: true,
      send_page_view: true
    });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    document.head.appendChild(script);
  };

  const consent = getConsent();
  if (consent === 'granted') {
    hideBanner();
    loadAnalytics();
  } else if (consent === 'denied') {
    hideBanner();
  } else {
    showBanner();
  }

  acceptButton?.addEventListener('click', () => {
    setConsent('granted');
    hideBanner();
    loadAnalytics();
  });

  rejectButton?.addEventListener('click', () => {
    setConsent('denied');
    hideBanner();
  });

  settingsButtons.forEach((button) => {
    button.addEventListener('click', () => {
      showBanner();
      acceptButton?.focus();
    });
  });
})();
