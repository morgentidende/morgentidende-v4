-- Base64 transport was retired from Media Worker. Keep the legacy column
-- temporarily for compatibility with current successful upload PATCHes, but
-- guarantee that no payload can be stored or reintroduced.

update public.manual_chat_media_upload_jobs
set payload_base64 = null
where payload_base64 is not null;

alter table public.manual_chat_media_upload_jobs
  drop constraint if exists manual_chat_media_upload_jobs_no_base64_payload;

alter table public.manual_chat_media_upload_jobs
  add constraint manual_chat_media_upload_jobs_no_base64_payload
  check (payload_base64 is null);
