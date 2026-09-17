const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#039;');

const EMAIL_LOGO_URL = 'https://raw.githubusercontent.com/morgentidende/morgentidende-v4/main/v4-frontend/public/morgentidende-sun.png';

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
              <img src="${EMAIL_LOGO_URL}" width="54" height="54" alt="Morgentidendes sol" style="display:block;margin:0 auto 12px;border:0;outline:none;text-decoration:none;" />
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1;font-weight:700;letter-spacing:-1px;">Morgentidende</div>
              <div style="margin-top:9px;color:#e9bf64;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Dagligt nyhedsbrev</div>
            </td>
          </tr>
          <tr>
            <td style="padding:42px 38px 26px;">
              <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.1;color:#182534;">Én sidste ting</h1>
              <p style="margin:0 0 18px;font-size:17px;line-height:1.65;color:#333842;">Du har bedt om at få Morgentidendes daglige nyhedsbrev hver morgen kl. 06.</p>
              <p style="margin:0 0 28px;font-size:17px;line-height:1.65;color:#333842;">Bekræft din e-mail, så ved vi, at det virkelig er dig, der har tilmeldt adressen.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr><td bgcolor="#d8a33d" style="border-radius:2px;"><a href="${safeUrl}" style="display:inline-block;padding:15px 24px;color:#17140c;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:.2px;">Bekræft min tilmelding</a></td></tr>
              </table>
              <p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#6f7178;">Linket virker i 48 timer. Hvis du ikke har tilmeldt dig, kan du bare ignorere denne mail.</p>
            </td>
          </tr>
          <tr><td style="padding:22px 38px 32px;border-top:1px solid #e6ddcf;color:#6f7178;font-size:12px;line-height:1.6;">Morgentidendes nyhedsbrev kan indeholde annoncer og kommercielle links, herunder affiliate-links til produkter og tjenester fra tredjeparter. Du kan til enhver tid afmelde dig igen.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
};

type DailyArticle = { slug: string; headline: string; deck?: string | null };

export const buildDailyNewsletterEmail = (articles: DailyArticle[], unsubscribeUrl: string, localDate: string) => {
  const items = articles.map((article, index) => {
    const url = `https://morgentidende.dk/artikel/${encodeURIComponent(article.slug)}`;
    const headline = escapeHtml(article.headline);
    const deck = article.deck ? escapeHtml(article.deck) : '';

    if (index === 0) {
      return `<tr><td class="lead-story" style="padding:30px 0 32px;border-top:1px solid #dccfae;border-bottom:1px solid #e6ddcf;">
        <div style="margin:0 0 10px;color:#b17b16;font-size:11px;line-height:1;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;">Tophistorie</div>
        <a href="${url}" style="font-family:Georgia,'Times New Roman',serif;font-size:31px;line-height:1.12;font-weight:700;color:#182534;text-decoration:none;letter-spacing:-.25px;">${headline}</a>
        ${deck ? `<p style="margin:12px 0 0;font-size:16px;line-height:1.6;color:#4f535b;">${deck}</p>` : ''}
        <div style="margin-top:16px;"><a href="${url}" style="font-size:13px;line-height:1.2;font-weight:700;color:#9a6a11;text-decoration:none;">Læs historien →</a></div>
      </td></tr>`;
    }

    return `<tr><td class="story" style="padding:24px 0;border-bottom:1px solid #e6ddcf;">
      <a href="${url}" style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.22;font-weight:700;color:#182534;text-decoration:none;letter-spacing:-.1px;">${headline}</a>
      ${deck ? `<p style="margin:9px 0 0;font-size:15px;line-height:1.58;color:#535862;">${deck}</p>` : ''}
    </td></tr>`;
  }).join('');

  const safeUnsubscribe = escapeHtml(unsubscribeUrl);
  const safeDate = escapeHtml(localDate);

  return `<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <style>
    @media screen and (max-width: 620px) {
      .outer { padding: 0 !important; }
      .content { padding-left: 24px !important; padding-right: 24px !important; }
      .masthead { padding-left: 24px !important; padding-right: 24px !important; }
      .lead-story a { font-size: 27px !important; }
      .story a { font-size: 21px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .email-bg { background:#0f1926 !important; }
      .email-card { background:#162331 !important; border-color:#33404e !important; }
      .content, .footer { background:#162331 !important; }
      .content h1, .lead-story a, .story a { color:#f7efe1 !important; }
      .content p, .footer, .footer a { color:#c3cad2 !important; }
      .lead-story, .story, .footer { border-color:#344250 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f4efe5;color:#17191d;font-family:Arial,Helvetica,sans-serif;">
  <table class="email-bg outer" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4efe5;padding:26px 12px;">
    <tr><td align="center">
      <table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#fffaf2;border:1px solid #ddd2c0;">
        <tr>
          <td class="masthead" style="padding:30px 38px 29px;background:#182534;color:#fffaf0;text-align:center;border-top:4px solid #d8a33d;">
            <img src="${EMAIL_LOGO_URL}" width="52" height="52" alt="Morgentidendes sol" style="display:block;margin:0 auto 10px;border:0;outline:none;text-decoration:none;" />
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1;font-weight:700;letter-spacing:-.8px;">Morgentidende</div>
            <div style="margin-top:10px;color:#e9bf64;font-size:11px;line-height:1;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Morgenoverblik · ${safeDate}</div>
          </td>
        </tr>
        <tr>
          <td class="content" style="padding:34px 40px 16px;background:#fffaf2;">
            <h1 style="margin:0 0 7px;font-family:Georgia,'Times New Roman',serif;font-size:31px;line-height:1.12;color:#182534;letter-spacing:-.3px;">Dagens vigtigste historier</h1>
            <p style="margin:0 0 18px;color:#6f7178;font-size:14px;line-height:1.45;">Kort og klart fra det seneste døgn.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${items}</table>
          </td>
        </tr>
        <tr>
          <td class="footer" style="padding:24px 40px 30px;background:#fffaf2;border-top:1px solid #e6ddcf;color:#767980;font-size:12px;line-height:1.65;">
            Du modtager denne mail, fordi du har bekræftet Morgentidendes daglige nyhedsbrev. <a href="${safeUnsubscribe}" style="color:#555b64;text-decoration:underline;">Afmeld nyhedsbrevet</a>.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};
