# Morgentidende pre-launch checklist

## SEO
- [x] Temporary workers.dev domain blocked from indexing
- [x] Host-aware production robots.txt prepared for morgentidende.dk
- [x] XML sitemap
- [x] News sitemap
- [ ] Canonical URLs verified on morgentidende.dk after domain cutover
- [x] NewsArticle JSON-LD on article pages
- [x] Organization/WebSite JSON-LD on front page
- [ ] Open Graph and social images verified on live domain
- [x] Branded 404 page
- [ ] Broken-link scan on deployed site

## Security
- [ ] Branch/ruleset protection verified
- [ ] CSP, HSTS and security headers verified on deployed production response
- [x] Supabase RLS/public-view privilege audit
- [x] CI guardrail against service-role/private keys in application code
- [ ] Admin MFA and rate limiting verified
- [x] Sensitive routes are no-store
- [x] Dependency vulnerability scan in CI
- [x] Backup/rollback procedure documented
- [ ] Backup restore procedure tested before launch

## Performance
- [ ] Core Web Vitals measured on real mobile and desktop deployment
- [x] Hero/card images have fixed dimensions and responsive sizing hints
- [ ] Modern AVIF/WebP delivery verified for article media
- [ ] Fonts self-hosted or final external-font choice justified
- [x] Client JavaScript reduced where practical; masthead date is server-rendered
- [ ] Final unused JS/CSS audit
- [x] Cache policy configured
- [ ] Cache headers verified on deployed responses
- [x] Card image layout space reserved to reduce layout shift
- [ ] Masthead regression verified on mobile and desktop

## Reliability / QA
- [x] Build, dependency audit and security guardrails run in CI
- [ ] Branch protection requires green CI before merge
- [ ] Front page live smoke test
- [ ] Article live smoke test
- [ ] Category live smoke test
- [ ] Mobile/desktop regression screenshots
- [x] Rollback procedure documented
- [ ] Rollback procedure exercised once before launch
- [x] Cloudflare Worker observability enabled and request IDs added
- [ ] External uptime monitoring configured after domain cutover

## Launch day
- [ ] Buy/connect morgentidende.dk
- [ ] TLS active
- [ ] Redirect workers.dev to morgentidende.dk where appropriate
- [ ] Confirm robots.txt allows production indexing
- [ ] Submit sitemap/search console
- [ ] Verify canonical URLs and structured data
- [ ] Verify security.txt contact mailbox works
- [ ] Re-run security and performance checks
