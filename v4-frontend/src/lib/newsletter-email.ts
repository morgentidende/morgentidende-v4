const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

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
              <img src="https://morgentidende.dk/morgentidende-sun.png" width="54" height="54" alt="" style="display:block;margin:0 auto 12px;" />
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
  const items = articles.map((article) => {
    const url = `https://morgentidende.dk/artikel/${encodeURIComponent(article.slug)}`;
    return `<tr><td style="padding:22px 0;border-top:1px solid #e6ddcf;">
      <a href="${url}" style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.2;font-weight:700;color:#182534;text-decoration:none;">${escapeHtml(article.headline)}</a>
      ${article.deck ? `<p style="margin:9px 0 0;font-size:15px;line-height:1.55;color:#4f535b;">${escapeHtml(article.deck)}</p>` : ''}
    </td></tr>`;
  }).join('');
  const safeUnsubscribe = escapeHtml(unsubscribeUrl);
  const safeDate = escapeHtml(localDate);
  return `<!doctype html><html lang="da"><body style="margin:0;padding:0;background:#f4efe5;color:#17191d;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4efe5;padding:24px 12px;"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#fffaf2;border:1px solid #ddd2c0;">
        <tr><td style="padding:28px 34px;background:#182534;color:#fffaf0;text-align:center;"><img src="https://morgentidende.dk/morgentidende-sun.png" width="48" height="48" alt="" style="display:block;margin:0 auto 10px;" /><div style="font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:700;">Morgentidende</div><div style="margin-top:8px;color:#e9bf64;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Morgenoverblik · ${safeDate}</div></td></tr>
        <tr><td style="padding:30px 36px 18px;"><h1 style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:30px;color:#182534;">Dagens vigtigste historier</h1><p style="margin:0 0 14px;color:#6f7178;font-size:14px;">Kort og klart fra det seneste døgn.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${items}</table></td></tr>
        <tr><td style="padding:22px 36px 30px;border-top:1px solid #e6ddcf;color:#767980;font-size:12px;line-height:1.6;">Du modtager denne mail, fordi du har bekræftet Morgentidendes daglige nyhedsbrev. <a href="${safeUnsubscribe}" style="color:#555b64;">Afmeld nyhedsbrevet</a>.</td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
};
