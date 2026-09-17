alter table public.newsletter_subscribers
  alter column include_viden set default false,
  alter column include_liv set default false;

update public.newsletter_subscribers
set include_viden = false,
    include_liv = false,
    updated_at = now()
where newsletter = 'daily';
