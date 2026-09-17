import { handle } from '@astrojs/cloudflare/handler';
import { runDailyNewsletter } from './lib/newsletter-daily';

export default {
  fetch(request: Request, env: Record<string, string | undefined>, ctx: any) {
    return handle(request, env, ctx);
  },
  async scheduled(controller: any, env: Record<string, string | undefined>, ctx: any) {
    ctx.waitUntil(runDailyNewsletter(env, new Date(controller.scheduledTime)));
  }
};
