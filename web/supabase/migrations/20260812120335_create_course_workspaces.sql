create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null unique
    check (access_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now())
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 240),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index courses_workspace_updated_idx
  on public.courses (workspace_id, updated_at desc);

alter table public.workspaces enable row level security;
alter table public.courses enable row level security;

revoke all on table public.workspaces from public, anon, authenticated;
revoke all on table public.courses from public, anon, authenticated;

grant select, insert, update, delete on table public.workspaces to service_role;
grant select, insert, update, delete on table public.courses to service_role;

comment on table public.workspaces is
  'Private browser workspaces. Raw access tokens are never stored.';
comment on table public.courses is
  'Course shelves owned by a Herbert workspace.';
