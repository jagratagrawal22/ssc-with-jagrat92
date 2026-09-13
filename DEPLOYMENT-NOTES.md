# v28 Deployment Notes

1. Upload the contents of this ZIP to the static host.
2. Ensure `_headers` is honored by the host. For non-Netlify hosts, translate its directives into the host/CDN security-header configuration.
3. Replace `sscwithjagrat.com` in `robots.txt`, `sitemap.xml`, and `security.txt` if the production domain is different.
4. Update Supabase Auth Site URL and Redirect URLs to HTTPS production URLs.
5. Deploy the Supabase Edge Functions and verify their secrets are configured server-side.
6. Run the existing database migrations in order through v27; v28 itself intentionally has no destructive database migration.
7. Clear/refresh the browser/PWA cache after deployment if a previous service worker is installed. v28 increments the cache name to `ssc-jagrat-shell-v4`.


## v43 — Video Stream Link
- Run `database_update_v43_video_stream_link.sql` once in Supabase SQL Editor before deploying this build.
- Admin Class form now supports YouTube Link, Stream Link, and Upload Video File.
- Student playback priority is Stream Link → Uploaded Video File → YouTube Link.
- Stream Link is stored as an external URL; it is not uploaded to Supabase Storage.
- Use only stream URLs you are authorized to distribute. Expiring/private URLs may stop working later.


## v43.1 — Stream Watch-Page Compatibility
- This is an additive patch on top of v43; existing v42/v43 features and data are preserved.
- Direct .mp4/.m4v/.webm/.ogg/.ogv/.mov/.m3u8 stream URLs use the native video player.
- Non-file stream URLs such as FileStreamBot/Telegram watch pages are opened in an embedded watch frame, with an Open stream fallback link.
- The security header allows HTTPS Heroku app hosts for embedded stream watch pages.
- Service-worker cache is bumped to v7 so the updated class player is picked up after deployment.
- Keep the v43 database migration and the v43 get-media-url Edge Function deployment requirements unchanged.


## v44 — Real EdTech Learning Experience
- Additive UI/UX upgrade on top of v43.1; existing database tables, subscriptions, AI, push, question bank, quizzes, admin and video systems are preserved.
- Dashboard now has a richer learning hub with study-day/question indicators and a My Learning course-progress area based on existing published classes and progress records.
- Subject pages now show course completion progress and the next class to continue.
- Class pages now show course journey progress (completed classes / total classes) for logged-in students.
- No new SQL migration is required for v44; it uses the existing progress, classes_public and subjects data.
- Service-worker cache is bumped to v8.

## v46 — Student Analytics & Performance Intelligence 2.0
- Upgrades Performance page into a real student analytics dashboard.
- Adds 14-day study consistency/activity visualization.
- Adds 7-day activity comparison and consistency insight.
- Adds subject-wise performance analysis.
- Adds reliable weak-topic detection and actionable study recommendations.
- Adds detailed topic accuracy with visual bars.
- Adds PYQ year and tier/shift analysis.
- Adds recent assessment/mocks trend.
- Adds performance snapshot cards.
- Reuses existing `quiz_response_events`, `quiz_attempts`, `quiz_mistakes`, `classes_public`, and `subjects` data.
- No new SQL migration required.
- Service-worker cache bumped to v9.


## V47 — Smart Exam Preparation + Revision Engine
- Built on V46; existing database and features preserved.
- Added SSC CGL preparation readiness signal and step-by-step daily study plan.
- Plan prioritizes due revision, weakest topic, mock practice, and daily goal.
- Added retention-focus panel to Smart Revision showing hard/PYQ/topic queue signals.
- Added direct navigation between Performance, Revision, AI practice and Mock Engine.
- No new SQL migration required.
- Service worker cache bumped to v9.


## V48 — Advanced Admin Intelligence
- Added Admin Intelligence Center using existing secured admin RPCs.
- Shows registered students, active Pro, active today, quiz attempts, average class score, PYQ accuracy and completion/activity signals.
- Adds action priorities for weak classes/topics, unstarted content and high-performing low-reach classes.
- Adds admin recommendations for content improvement, promotion and re-engagement.
- No new Supabase SQL migration required.

## V49 — Final UI / UX + Production Polish
- Final cumulative polish on V48.
- Improved focus-visible accessibility and reduced-motion support.
- Added subtle page/card transitions and loading skeleton utility.
- Added shared accessible toast utility and page-load progress indicator.
- Improved mobile topbar spacing and PWA install presentation.
- Improved side-menu accessibility: expanded state, current-page highlighting, focus return, and scroll locking while open.
- Added smoother rendering/interaction polish without changing Supabase data contracts.
- Service-worker shell cache bumped to v10.
- No new SQL migration required.
- All existing subscriptions, AI, push, Question Bank, Quiz, Mock, Analytics, Revision, Admin Intelligence and video features preserved.

## v50 — Realistic Student Profile 2.0
- Final cumulative build after v49.
- Upgraded account/profile experience with a realistic student profile dashboard.
- Added avatar, exam target, study goal, Pro/Free status, XP/level, streak, question count, accuracy, rank, completed classes, revision queue, learning overview, badges and quick actions.
- Uses existing Supabase tables/RPCs; no new SQL migration required.
- Service worker cache bumped to v11.


## V50.1 — Install control + Dashboard resilience
- PWA install control is a compact bottom-right button, positioned above the Online/Offline status indicator on mobile and desktop.
- Dashboard optional data queries no longer abort the complete dashboard when one query returns an error; available sections still render.
- Service-worker cache bumped to v11 to ensure the fix reaches returning users.
- No database migration required.

## V51 — AI Smart Exam Simulator 2.0
- Adds AI Smart Mock controls to Exam Simulator.
- Supports SSC CGL, SSC CHSL and Railway exam context, subject, chapter/custom focus and 25/50/100 question sizes.
- Existing verified question-bank modes remain unchanged.
- AI-created questions are explicitly labelled AI Practice; the AI is instructed never to claim generated content is an official PYQ.
- AI Smart Mock uses the same timer, palette, mark-for-review, clear answers and negative-marking experience.
- AI-generated mocks calculate results locally because generated questions are not inserted into the verified PYQ database.
- Updated `supabase/functions/ai-study-assistant/index.ts` with `smart_mock` mode. Deploy the updated Edge Function code in Supabase after deploying the frontend.
- No new SQL migration is required.
- Service worker cache bumped to v12.


## V51.1 Fix
- Fixed AI Smart Mock Edge Function validation: smart_mock requests do not require the tutor prompt field.
- Improved Exam Simulator error display to surface the Edge Function response message.
- Exam Simulator now loads the question pool on page load so the availability/Topic blueprint does not initially show 0.
- No database migration required.

## v51.2 — AI Smart Mock Options Fix
- Fixed AI Smart Mock option rendering when Gemini returns options in array/object/choice formats.
- Normalizes option text before rendering and refuses to start an incomplete mock.
- Service worker cache bumped to v13 to avoid stale simulator JS.
- No database migration required.
