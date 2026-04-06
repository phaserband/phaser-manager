-- Conexiune Google Calendar cu refresh token (Edge Functions + OAuth server-side).
-- RLS: fără politici pentru roluri JWT → niciun acces direct din PostgREST.
-- Doar service_role (în Functions) citește/scrie.

create table if not exists public.google_calendar_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.google_calendar_credentials enable row level security;

-- Intenționat fără policy: utilizatorii nu văd tokenul niciodată din client.

comment on table public.google_calendar_credentials is 'Refresh token Google Calendar per user; folosit doar din Supabase Edge Functions.';
