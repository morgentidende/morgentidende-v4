export const NEUTRAL_SIGNUP_MESSAGE = 'Hvis adressen kan bruges, sender vi en bekræftelsesmail.';

export const classifyNewsletterRpcError = (error) => {
  const haystack = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  if (haystack.includes('invalid_email')) return 'invalid_email';
  if (haystack.includes('signup_rate_limited')) return 'signup_rate_limited';
  if (haystack.includes('already_subscribed')) return 'already_subscribed';
  if (haystack.includes('unsupported_newsletter') || haystack.includes('invalid_newsletter_metadata')) return 'invalid_request';
  return 'database_error';
};

export const newsletterRpcResponse = (code) => {
  if (code === 'already_subscribed') {
    return { status: 200, body: { ok: true, message: NEUTRAL_SIGNUP_MESSAGE } };
  }
  if (code === 'invalid_email' || code === 'invalid_request') {
    return { status: 400, body: { message: 'Indtast en gyldig e-mailadresse.' } };
  }
  if (code === 'signup_rate_limited') {
    return { status: 429, body: { message: 'Vent et øjeblik og prøv igen.' } };
  }
  return { status: 500, body: { message: 'Tilmeldingen kunne ikke gennemføres. Prøv igen.' } };
};
