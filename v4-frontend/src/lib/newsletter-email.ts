const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#039;');

const sunMark = (size = 52) => `<div role="img" aria-label="Morgentidendes sol" style="width:${size}px;height:${size}px;line-height:${size}px;margin:0 auto 10px;border-radius:50%;background:#0b2c4a;color:#e9bf64;text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:${Math.round(size * .64)}px;font-weight:700;">☀</div>`;

const formatDanishDate = (localDate: string) => {
  const [year, month, day] = localDate.split('-').map(Number);
  if (!year || !month || !day) return localDate;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const formatted = new Intl.DateTimeFormat('da-DK', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Copenhagen'
  }).format(date);
  const [weekday, rest] = formatted.split(' ');
  const capitalized = weekday ? weekday.charAt(0).toUpperCase() + weekday.slice(1) : '';
  return `${capitalized} d. ${rest || ''}`.trim();
};

export const buildNewsletterConfirmationEmail = (confirmationUrl: string) => {
  const safeUrl = escapeHtml(confirmationUrl);
  return `<!doctype html>
<html lang="da">
  <body style="margin:0;padding:0;background:#f4efe5;color:#17191d;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4efe5;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#fffaf2;border:1px solid #ddd2c0;">
          <tr>
            <td style="padding:30px 34px;background:#182534;color:#fffaf0;text-align:center;">
              ${sunMark(54)}
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1;font-weight:700;letter-spacing:-1px;">Morgentidende</div>
              <div style="margin-top:9px;color:#e9bf64;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Dagligt nyhedsbrev</div>
            </td>
          </tr>
          <tr>
            <td style="padding:42px 38px 26px;">
              <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.1;color:#182534;">Én sidste ting</h1>
              <p style="margin:0 0 18px;font-size:17px;line-height:1.65;color:#333842;">Du har bedt om at få Morgentidendes daglige nyhedsbrev hver morgen kl. 06.</p>
              <p style="margin:0 0 28px;font-size:17px;line-height:1.65;color:#333842;">Bekræft din e-mail, så ved vi, at det virkelig er dig, der har tilmeldt adressen.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#d8a33d"><a href="${safeUrl}" style="display:inline-block;padding:15px 24px;color:#17140c;text-decoration:none;font-size:15px;font-weight:700;">Bekræft min tilmelding</a></td></tr></table>
              <p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#6f7178;">Linket virker i 48 timer. Hvis du ikke har tilmeldt dig, kan du bare ignorere denne mail.</p>
            </td>
          </tr>
          <tr><td style="padding:22px 38px 32px;border-top:1px solid #e6ddcf;color:#6f7178;font-size:12px;line-height:1.6;">Morgentidendes nyhedsbrev kan indeholde annoncer og kommercielle links. Du kan til enhver tid afmelde dig igen.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
};

type DailyArticle = { slug: string; headline: string; deck?: string | null; category_slug?: string | null };
export type NewsletterPreferences = { emailTheme?: 'auto' | 'light' | 'dark'; includeViden?: boolean; includeLiv?: boolean };

export const buildDailyNewsletterEmail = (
  articles: DailyArticle[],
  unsubscribeUrl: string,
  localDate: string,
  preferences: NewsletterPreferences = {}
) => {
  const theme = preferences.emailTheme || 'auto';
  const isDark = theme === 'dark';
  const filtered = articles.filter((article) => {
    if (article.category_slug === 'viden' && preferences.includeViden === false) return false;
    if (article.category_slug === 'liv' && preferences.includeLiv === false) return false;
    return true;
  }).slice(0, 8);

  const cardBg = isDark ? '#162331' : '#fffaf2';
  const outerBg = isDark ? '#0f1926' : '#f4efe5';
  const headlineColor = isDark ? '#f7efe1' : '#182534';
  const bodyColor = isDark ? '#c3cad2' : '#535862';
  const mutedColor = isDark ? '#aeb7c1' : '#6f7178';
  const borderColor = isDark ? '#344250' : '#e6ddcf';

  const items = filtered.map((article, index) => {
    const url = `https://morgentidende.dk/artikel/${encodeURIComponent(article.slug)}`;
    const headline = escapeHtml(article.headline);
    const deck = article.deck ? escapeHtml(article.deck) : '';
    if (index === 0) {
      return `<tr><td class="lead-story" style="padding:30px 0 32px;border-top:1px solid ${borderColor};border-bottom:1px solid ${borderColor};">
        <div style="margin:0 0 10px;color:#b17b16;font-size:11px;line-height:1;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;">Tophistorie</div>
        <a href="${url}" style="font-family:Georgia,'Times New Roman',serif;font-size:31px;line-height:1.12;font-weight:700;color:${headlineColor};text-decoration:none;letter-spacing:-.25px;">${headline}</a>
        ${deck ? `<p style="margin:12px 0 0;font-size:16px;line-height:1.6;color:${bodyColor};">${deck}</p>` : ''}
        <div style="margin-top:16px;"><a href="${url}" style="font-size:13px;font-weight:700;color:#b17b16;text-decoration:none;">Læs historien →</a></div>
      </td></tr>`;
    }
    return `<tr><td class="story" style="padding:24px 0;border-bottom:1px solid ${borderColor};">
      <a href="${url}" style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.22;font-weight:700;color:${headlineColor};text-decoration:none;">${headline}</a>
      ${deck ? `<p style="margin:9px 0 0;font-size:15px;line-height:1.58;color:${bodyColor};">${deck}</p>` : ''}
    </td></tr>`;
  }).join('');

  const safeUnsubscribe = escapeHtml(unsubscribeUrl);
  let token = '';
  try { token = new URL(unsubscribeUrl).searchParams.get('token') || ''; } catch {}
  const preferencesUrl = `https://morgentidende.dk/nyhedsbrev/indstillinger?token=${encodeURIComponent(token)}`;
  const safePreferences = escapeHtml(preferencesUrl);
  const safeDate = escapeHtml(formatDanishDate(localDate));
  const autoDarkCss = theme === 'auto' ? `@media (prefers-color-scheme: dark) {
      .email-bg { background:#0f1926 !important; }
      .email-card, .content, .footer, .prefs { background:#162331 !important; }
      .content h1, .lead-story a, .story a, .prefs-title { color:#f7efe1 !important; }
      .content p, .footer, .footer a, .prefs-copy { color:#c3cad2 !important; }
      .lead-story, .story, .footer, .prefs { border-color:#344250 !important; }
    }` : '';

  return `<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="${theme === 'auto' ? 'light dark' : theme}" />
  <meta name="supported-color-schemes" content="${theme === 'auto' ? 'light dark' : theme}" />
  <style>
    @media screen and (max-width:620px){.outer{padding:0!important}.content,.masthead,.footer,.prefs{padding-left:24px!important;padding-right:24px!important}.lead-story a{font-size:27px!important}.story a{font-size:21px!important}}
    ${autoDarkCss}
  </style>
</head>
<body style="margin:0;padding:0;background:${outerBg};color:#17191d;font-family:Arial,Helvetica,sans-serif;">
  <table class="email-bg outer" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${outerBg};padding:26px 12px;"><tr><td align="center">
    <table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:${cardBg};border:1px solid ${borderColor};">
      <tr><td class="masthead" style="padding:30px 38px 29px;background:#182534;color:#fffaf0;text-align:center;border-top:4px solid #d8a33d;">
        ${sunMark(52)}
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1;font-weight:700;letter-spacing:-.8px;">Morgentidende</div>
        <div style="margin-top:10px;color:#e9bf64;font-size:11px;line-height:1;font-weight:800;letter-spacing:1.5px;text-transform:none;">Morgenoverblik · ${safeDate}</div>
      </td></tr>
      <tr><td class="content" style="padding:34px 40px 16px;background:${cardBg};">
        <h1 style="margin:0 0 7px;font-family:Georgia,'Times New Roman',serif;font-size:31px;line-height:1.12;color:${headlineColor};">Dagens vigtigste historier</h1>
        <p style="margin:0 0 18px;color:${mutedColor};font-size:14px;line-height:1.45;">Kort og klart fra det seneste døgn.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${items}</table>
      </td></tr>
      <tr><td class="prefs" style="padding:24px 40px;background:${cardBg};border-top:1px solid ${borderColor};">
        <div class="prefs-title" style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:${headlineColor};margin-bottom:6px;">Tilpas fremtidige nyhedsbreve</div>
        <div class="prefs-copy" style="font-size:13px;line-height:1.55;color:${mutedColor};margin-bottom:12px;">Vælg <strong>Automatisk, Lys eller Mørk</strong> visning og om du vil have <strong>Magasinet Viden</strong> og <strong>Magasinet Liv</strong> med.</div>
        <a href="${safePreferences}" style="display:inline-block;padding:10px 14px;background:#d8a33d;color:#17140c;text-decoration:none;font-size:13px;font-weight:800;">Vælg indstillinger</a>
      </td></tr>
      <tr><td class="footer" style="padding:20px 40px 28px;background:${cardBg};border-top:1px solid ${borderColor};color:${mutedColor};font-size:12px;line-height:1.65;">
        Du modtager denne mail, fordi du har bekræftet Morgentidendes daglige nyhedsbrev. <a href="${safeUnsubscribe}" style="color:${mutedColor};text-decoration:underline;">Afmeld nyhedsbrevet</a>.
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
};
