# SSC With Jagrat — Temporary Free Access Update

This build changes the student-facing experience so currently paid/locked class content is free for everyone:

- All published classes are treated as free by the `get-media-url` Edge Function.
- Video files/streams are returned without login or subscription checks.
- Practice sheets and notes attached to classes are also returned without subscription checks.
- The class-page paid paywall has been removed from the normal frontend flow.
- The "DEMO CLASS COMPLETED / VIEW PLANS & SUBSCRIBE" CTA has been removed.
- Subject class cards no longer show `FREE DEMO` or `PRO` badges.
- Student account no longer shows the subscription purchase cards; it shows that content is currently free.
- Service-worker cache is bumped to v17.

## Important: deploy the Edge Function

The frontend alone cannot remove the server-side lock because private video files are signed by Supabase Edge Function `get-media-url`.

Deploy the included function to the same Supabase project:

`supabase functions deploy get-media-url`

After deployment, redeploy this website build to Vercel.

## Temporary-free behavior

This is intentionally a temporary free-access mode. If paid access is enabled again later, restore the subscription check in `supabase/functions/get-media-url/index.ts` and restore the frontend subscription UI.
