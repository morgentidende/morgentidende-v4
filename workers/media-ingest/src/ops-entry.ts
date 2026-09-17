import worker from './queue-entry';
import baseWorker from './index';
import { maybeHandleSvgChatUpload } from './svg-chat-upload';
import { maybeHandleDirectChatUpload } from './direct-chat-upload';
import { maybeHandleDropboxChatUpload, processPendingDropboxChatJobs } from './dropbox-chat-upload';
import { pollLivecenterMetrics } from './livecenter-metrics';
import { recordLivecenterMetricPoll } from './livecenter-metrics-observability';
import { checkLivecenterEditorialCadence } from './livecenter-editorial-watchdog';

interface Env {
  MEDIA_BUCKET: R2Bucket;
  MEDIA_PUBLIC_BASE_URL: string;
  MEDIA_MAX_BYTES?: string;
  MEDIA_INGEST_TOKEN: string;
  OPS_MEDIA_TOKEN?: string;
  CHAT_MEDIA_TOKEN?: string;
  IMAGES: any;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const withCanonicalMediaAuth = (request: Request, env: Env) => {
  const auth = request.headers.get('authorization') || '';
  const supplied = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  const opsToken = env.OPS_MEDIA_TOKEN || '';
  const chatToken = env.CHAT_MEDIA_TOKEN || '';
  const allowed = (opsToken && safeEqual(supplied, opsToken))
    || (chatToken && safeEqual(supplied, chatToken));
  if (!allowed) return request;
  const headers = new Headers(request.headers);
  headers.set('authorization', `Bearer ${env.MEDIA_INGEST_TOKEN}`);
  return new Request(request, { headers });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const dropboxResponse = await maybeHandleDropboxChatUpload(request, env, baseWorker);
    if (dropboxResponse) return dropboxResponse;

    const directResponse = await maybeHandleDirectChatUpload(request, env, baseWorker);
    if (directResponse) return directResponse;

    const svgResponse = await maybeHandleSvgChatUpload(request, env, baseWorker);
    if (svgResponse) return svgResponse;

    return worker.fetch(withCanonicalMediaAuth(request, env), env);
  },

  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // The existing one-minute runtime hosts independent scheduled modules.
    // Each module owns its own cadence; Livecenter rows currently request five-minute polling.
    ctx.waitUntil(processPendingDropboxChatJobs(env, baseWorker, 5));
    const startedAt = new Date().toISOString();
    ctx.waitUntil(
      pollLivecenterMetrics(env)
        .then(async (result) => {
          console.log(JSON.stringify({ subsystem: 'livecenter_metrics', ...result }));
          await recordLivecenterMetricPoll(env, {
            started_at: startedAt,
            completed_at: new Date().toISOString(),
            centers_due: result.centers_due,
            outcomes: result.outcomes,
            error: null,
          });
        })
        .catch(async (error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error('livecenter_metrics_failed', error);
          await recordLivecenterMetricPoll(env, {
            started_at: startedAt,
            completed_at: new Date().toISOString(),
            outcomes: [],
            error: message.slice(0, 1000),
          });
        }),
    );
    ctx.waitUntil(
      checkLivecenterEditorialCadence(env, 90)
        .then((result) => console.log(JSON.stringify({ subsystem: 'livecenter_editorial_watchdog', ...result })))
        .catch((error) => console.error('livecenter_editorial_watchdog_failed', error)),
    );
    return worker.scheduled(controller, env, ctx);
  },
};
