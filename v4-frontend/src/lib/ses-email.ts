const encoder = new TextEncoder();

const MORGENTIDENDE_SUN_PNG_BASE64 = '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';

const toHex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return toHex(digest);
};

const hmac = async (key: ArrayBuffer | Uint8Array, value: string) => {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value));
};

const signingKey = async (secret: string, date: string, region: string, service: string) => {
  const kDate = await hmac(encoder.encode(`AWS4${secret}`), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
};

export const buildSesV2Payload = (from: string, to: string, subject: string, html: string) =>
  JSON.stringify({
    FromEmailAddress: from,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
        Attachments: [
          {
            RawContent: MORGENTIDENDE_SUN_PNG_BASE64,
            ContentDisposition: 'INLINE',
            FileName: 'morgentidende-sun.png',
            ContentDescription: 'Morgentidendes solsymbol',
            ContentId: 'morgentidende-sun',
            ContentTransferEncoding: 'BASE64',
            ContentType: 'image/png'
          }
        ]
      }
    }
  });

export const sendSesHtmlEmail = async (options: {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}) => {
  const region = options.region;
  const host = `email.${region}.amazonaws.com`;
  const path = '/v2/email/outbound-emails';
  const body = buildSesV2Payload(options.from, options.to, options.subject, options.html);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(body);
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';
  const canonicalRequest = ['POST', path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');
  const signature = toHex(await hmac(await signingKey(options.secretAccessKey, dateStamp, region, 'ses'), stringToSign));
  const response = await fetch(`https://${host}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-amz-date': amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    },
    body
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, body: text.slice(0, 400) };
};
