create extension if not exists supabase_vault with schema vault;

create table if not exists public.herbert_api_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'deepseek' check (provider = 'deepseek'),
  vault_secret_id uuid not null unique,
  key_hint text not null check (char_length(key_hint) between 4 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.herbert_api_credentials enable row level security;
revoke all on table public.herbert_api_credentials from public, anon, authenticated;
grant select, insert, update, delete on table public.herbert_api_credentials to service_role;

create or replace function public.herbert_store_deepseek_key(
  p_user_id uuid,
  p_secret text,
  p_hint text
)
returns table (key_hint text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_secret_id uuid;
  next_secret_id uuid;
  secret_name text := 'herbert_deepseek_' || p_user_id::text;
begin
  if p_user_id is null or char_length(p_secret) < 8 or char_length(p_secret) > 512 then
    raise exception 'Invalid Herbert credential input';
  end if;

  select credentials.vault_secret_id
    into existing_secret_id
    from public.herbert_api_credentials as credentials
    where credentials.user_id = p_user_id
    for update;

  if existing_secret_id is null then
    select vault.create_secret(
      p_secret,
      secret_name,
      'Herbert user-owned DeepSeek API key'
    ) into next_secret_id;

    insert into public.herbert_api_credentials (
      user_id,
      provider,
      vault_secret_id,
      key_hint
    ) values (
      p_user_id,
      'deepseek',
      next_secret_id,
      p_hint
    );
  else
    perform vault.update_secret(
      existing_secret_id,
      p_secret,
      secret_name,
      'Herbert user-owned DeepSeek API key'
    );

    update public.herbert_api_credentials
      set key_hint = p_hint,
          updated_at = now()
      where user_id = p_user_id;
  end if;

  return query
    select credentials.key_hint, credentials.updated_at
      from public.herbert_api_credentials as credentials
      where credentials.user_id = p_user_id;
end;
$$;

create or replace function public.herbert_get_deepseek_key(p_user_id uuid)
returns table (decrypted_secret text, key_hint text)
language sql
security definer
set search_path = ''
stable
as $$
  select secrets.decrypted_secret, credentials.key_hint
    from public.herbert_api_credentials as credentials
    join vault.decrypted_secrets as secrets
      on secrets.id = credentials.vault_secret_id
    where credentials.user_id = p_user_id
      and credentials.provider = 'deepseek'
    limit 1;
$$;

create or replace function public.herbert_deepseek_key_status(p_user_id uuid)
returns table (key_hint text, updated_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $$
  select credentials.key_hint, credentials.updated_at
    from public.herbert_api_credentials as credentials
    where credentials.user_id = p_user_id
      and credentials.provider = 'deepseek'
    limit 1;
$$;

create or replace function public.herbert_remove_vault_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.vault_secret_id;
  return old;
end;
$$;

drop trigger if exists herbert_remove_vault_secret on public.herbert_api_credentials;
create trigger herbert_remove_vault_secret
  after delete on public.herbert_api_credentials
  for each row execute function public.herbert_remove_vault_secret();

create or replace function public.herbert_delete_deepseek_key(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.herbert_api_credentials where user_id = p_user_id;
$$;

revoke all on function public.herbert_store_deepseek_key(uuid, text, text) from public, anon, authenticated;
revoke all on function public.herbert_get_deepseek_key(uuid) from public, anon, authenticated;
revoke all on function public.herbert_deepseek_key_status(uuid) from public, anon, authenticated;
revoke all on function public.herbert_delete_deepseek_key(uuid) from public, anon, authenticated;
revoke all on function public.herbert_remove_vault_secret() from public, anon, authenticated;

grant execute on function public.herbert_store_deepseek_key(uuid, text, text) to service_role;
grant execute on function public.herbert_get_deepseek_key(uuid) to service_role;
grant execute on function public.herbert_deepseek_key_status(uuid) to service_role;
grant execute on function public.herbert_delete_deepseek_key(uuid) to service_role;
