# Morgentidende pre-launch checklist

## SEO
- [ ] Temporary workers.dev domain blocked from indexing
- [ ] Production robots.txt for morgentidende.dk
- [ ] XML sitemap
- [ ] News sitemap
- [ ] Canonical URLs point to morgentidende.dk
- [ ] NewsArticle JSON-LD on article pages
- [ ] Organization/WebSite JSON-LD on front page
- [ ] Open Graph and social images verified
- [ ] 404 page and broken-link scan

## Security
- [ ] Branch/ruleset protection enabled
- [ ] CSP, HSTS and security headers verified in production
- [ ] Supabase RLS audit
- [ ] No service-role or private secrets in frontend/repo
- [ ] Admin MFA and rate limiting
- [ ] Sensitive routes are no-store
- [ ] Dependency vulnerability scan in CI
- [ ] Backup and restore procedure tested

## Performance
- [ ] Core Web Vitals measured on mobile and desktop
- [ ] Hero images have responsive sizes and modern formats
- [ ] Fonts self-hosted or justified
- [ ] Unused JS/CSS removed
- [ ] Cache policy verified
- [ ] No layout shift in masthead/cards

## Reliability / QA
- [ ] Build and tests required before merge
- [ ] Front page smoke test
- [ ] Article smoke test
- [ ] Category smoke test
- [ ] Mobile/desktop regression screenshots
- [ ] Rollback procedure verified
- [ ] Uptime/error monitoring configured

## Launch day
- [ ] Buy/connect morgentidende.dk
- [ ] TLS active
- [ ] Redirect workers.dev to morgentidende.dk where appropriate
- [ ] Switch robots.txt from pre-launch block to production rules
- [ ] Submit sitemap/search console
- [ ] Verify canonical URLs and structured data
- [ ] Re-run security and performance checks
