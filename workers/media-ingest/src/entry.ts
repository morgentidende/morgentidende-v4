import worker from './index';

interface Env {
  MEDIA_BUCKET: R2Bucket;
  MEDIA_INGEST_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const diagnosticResponse = async (env: Env, original: Response) => {
  let supabaseStatus: number | string = 'not_checked';
  let r2Binding = false;

  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/media_assets?select=id&limit=1`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    supabaseStatus = response.status;
  } catch (error) {
    supabaseStatus = error instanceof Error ? `fetch_error:${error.name}` : 'fetch_error';
  }

  try {
    await env.MEDIA_BUCKET.head('__morgentidende_smoke_binding_check__');
    r2Binding = true;
  } catch {
    r2Binding = false;
  }

  return new Response(JSON.stringify({
    error: 'internal_error',
    diagnostic: {
      supabase_status: supabaseStatus,
      r2_binding_ok: r2Binding,
      original_status: original.status,
    },
  }), {
    status: 500,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const response = await worker.fetch(request, env as never, ctx as never);

    const isSmoke = request.headers.get('x-media-smoke-test') === '1';
    if (isSmoke && response.status === 500) {
      return diagnosticResponse(env, response);
    }

    return response;
  },
};
