-- Finalize the manual chat media upload transport after retiring base64 payloads.
-- Historical migrations remain immutable; this migration brings the live schema
-- in line with the active Dropbox/direct-binary transports.

update public.manual_chat_media_upload_jobs
set status = 'expired',
    updated_at = now()
where status in ('pending', 'failed')
  and expires_at <= now();

alter table public.manual_chat_media_upload_jobs
  drop constraint if exists manual_chat_media_upload_jobs_no_base64_payload;

alter table public.manual_chat_media_upload_jobs
  drop column if exists payload_base64;
