# SSC With Jagrat v28 — Production Hardening Checklist

This release is a deployment hardening pass. It does not replace a real penetration test or hosting-provider configuration review.

## Before launch
- [ ] Serve the site only over HTTPS and point the production Supabase Site URL/redirect URLs to the real domain.
- [ ] Deploy all required Supabase migrations through v27, then deploy every Edge Function used by the app.
- [ ] Configure Edge Function secrets only in Supabase: Razorpay secret, service role key, OpenAI key, VAPID private key, push cron secret, etc.
- [ ] Never commit `.env` files, service-role keys, Razorpay secrets, OpenAI keys, or VAPID private keys.
- [ ] Put only the Supabase publishable/anon key in `assets/config.js`.
- [ ] Test Razorpay in Test Mode first; verify order/user/plan/amount/currency/signature binding before Live Mode.
- [ ] Configure the production AI model/key and enforce usage limits in the Edge Function/database.
- [ ] Configure VAPID keys and a protected scheduler for push notifications.
- [ ] Configure the site's exact production URL in `robots.txt` and `sitemap.xml` if the domain differs from `sscwithjagrat.com`.
- [ ] Configure the host to send `_headers` rules (Netlify supports `_headers`; other hosts need equivalent configuration).

## Security checks
- [ ] Confirm RLS is enabled on every user-owned table and public roles cannot select private answer keys, payments, push credentials, or user analytics.
- [ ] Confirm paid media is delivered only through the signed-URL/entitlement path.
- [ ] Confirm `quiz_questions_public` never includes `correct_option` or private explanations.
- [ ] Confirm scoring functions are executable only by intended roles.
- [ ] Confirm admin RPCs verify the admin role/email server-side.
- [ ] Confirm Razorpay `verify-payment` validates the exact stored order, user, plan, amount, currency and signature.
- [ ] Confirm expired subscriptions cannot access paid media/features.
- [ ] Confirm service-role keys are never returned by any Edge Function response.
- [ ] Review Supabase Auth email redirect URLs and password-reset redirects.

## Functional smoke test
- [ ] Logged-out user can browse public subjects/classes and Class 01.
- [ ] Paid class remains locked without an active entitlement.
- [ ] Student can log in, subscribe in test mode, access entitled features, and see expiry.
- [ ] Quiz, Daily Challenge, Practice, Exam Simulator, Revision and Mistake Book all submit successfully.
- [ ] AI Tutor works only when the Edge Function is configured and fails gracefully otherwise.
- [ ] PWA installs, loads offline shell, and syncs supported queued activity after reconnect.
- [ ] Push permission, subscription, unsubscribe and notification click all work on a supported browser.
- [ ] Admin question import validates malformed rows and archive/restore is non-destructive.
- [ ] Progress report and analytics load for a normal student without exposing another student's data.

## Performance
- [ ] Enable Brotli/gzip at the host/CDN.
- [ ] Configure long-lived caching for fingerprinted/static assets where appropriate.
- [ ] Keep HTML/API responses private or no-store when they contain user-specific data.
- [ ] Compress large images and avoid loading unnecessary scripts on each page.
- [ ] Monitor Supabase database/API usage and Edge Function latency.

## Backups and operations
- [ ] Enable Supabase database backups/Point-in-Time Recovery appropriate to the plan.
- [ ] Export/backup question-bank CSV before major bulk changes.
- [ ] Keep a copy of the previous production ZIP before deployment.
- [ ] Record migration order and never skip a migration in a fresh environment.
- [ ] Set up error monitoring and an admin contact email.
