type RuntimeBag = Record<string, string | undefined>;

const readRuntimeEnv = (locals?: App.Locals): RuntimeBag => {
  const legacyRuntime = (locals as { runtime?: { env?: RuntimeBag } } | undefined)?.runtime?.env;
  return legacyRuntime || {};
};

const pick = (runtime: RuntimeBag, key: string) => {
  const value = runtime[key] || import.meta.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
};

export type NewsletterRuntimeEnv = {
  supabaseUrl: string;
  supabaseSecretKey: string;
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  newsletterFrom: string;
};

export const getNewsletterRuntimeEnv = (locals?: App.Locals): NewsletterRuntimeEnv => {
  const runtime = readRuntimeEnv(locals);
  return {
    supabaseUrl: pick(runtime, 'PUBLIC_SUPABASE_URL'),
    supabaseSecretKey: pick(runtime, 'SUPABASE_SECRET_KEY'),
    awsRegion: pick(runtime, 'AWS_SES_REGION') || pick(runtime, 'AWS_REGION'),
    awsAccessKeyId: pick(runtime, 'AWS_ACCESS_KEY_ID'),
    awsSecretAccessKey: pick(runtime, 'AWS_SECRET_ACCESS_KEY'),
    newsletterFrom: pick(runtime, 'NEWSLETTER_FROM') || 'Morgentidende <nyhedsbrev@morgentidende.dk>'
  };
};

export const hasSupabaseServerEnv = (env: NewsletterRuntimeEnv) =>
  Boolean(env.supabaseUrl && env.supabaseSecretKey);

export const hasSesEnv = (env: NewsletterRuntimeEnv) =>
  Boolean(env.awsRegion && env.awsAccessKeyId && env.awsSecretAccessKey);

