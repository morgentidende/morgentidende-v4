const encoder = new TextEncoder();

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
        Body: { Html: { Data: html, Charset: 'UTF-8' } }
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
