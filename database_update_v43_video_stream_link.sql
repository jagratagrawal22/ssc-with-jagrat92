-- v43: Add a direct stream-link source for class videos. ADDITIVE / NON-DESTRUCTIVE.
-- Existing YouTube links and uploaded video files are preserved.

alter table public.classes
  add column if not exists video_stream_url text;
