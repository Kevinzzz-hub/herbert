alter table public.herbert_api_credentials
  drop constraint if exists herbert_api_credentials_provider_check;

alter table public.herbert_api_credentials
  add constraint herbert_api_credentials_provider_check
  check (provider in ('deepseek', 'openai', 'gemini', 'anthropic', 'openrouter'));

alter table public.herbert_api_credentials
  add column if not exists model text;

update public.herbert_api_credentials
  set model = 'deepseek-v4-flash'
  where model is null or btrim(model) = '';

alter table public.herbert_api_credentials
  alter column model set not null;

alter table public.herbert_api_credentials
  drop constraint if exists herbert_api_credentials_model_check;

alter table public.herbert_api_credentials
  add constraint herbert_api_credentials_model_check
  check (char_length(model) between 1 and 120);

create or replace function public.herbert_store_ai_credential(
  p_user_id uuid,
  p_provider text,
  p_model text,
  p_secret text,
  p_hint text
)
returns table (provider text, model text, key_hint text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_secret_id uuid;
  next_secret_id uuid;
  secret_name text := 'herbert_ai_' || p_user_id::text;
begin
  if p_user_id is null
    or p_provider not in ('deepseek', 'openai', 'gemini', 'anthropic', 'openrouter')
    or char_length(p_model) < 1
    or char_length(p_model) > 120
    or char_length(p_secret) < 8
    or char_length(p_secret) > 512
  then
    raise exception 'Invalid Herbert AI credential input';
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
      'Herbert user-owned AI provider key'
    ) into next_secret_id;

    insert into public.herbert_api_credentials (
      user_id,
      provider,
      model,
      vault_secret_id,
      key_hint
    ) values (
      p_user_id,
      p_provider,
      p_model,
      next_secret_id,
      p_hint
    );
  else
    perform vault.update_secret(
      existing_secret_id,
      p_secret,
      secret_name,
      'Herbert user-owned AI provider key'
    );

    update public.herbert_api_credentials
      set provider = p_provider,
          model = p_model,
          key_hint = p_hint,
          updated_at = now()
      where user_id = p_user_id;
  end if;

  return query
    select credentials.provider, credentials.model, credentials.key_hint, credentials.updated_at
      from public.herbert_api_credentials as credentials
      where credentials.user_id = p_user_id;
end;
$$;

create or replace function public.herbert_get_ai_credential(p_user_id uuid)
returns table (provider text, model text, decrypted_secret text, key_hint text)
language sql
security definer
set search_path = ''
stable
as $$
  select credentials.provider, credentials.model, secrets.decrypted_secret, credentials.key_hint
    from public.herbert_api_credentials as credentials
    join vault.decrypted_secrets as secrets
      on secrets.id = credentials.vault_secret_id
    where credentials.user_id = p_user_id
    limit 1;
$$;

create or replace function public.herbert_ai_credential_status(p_user_id uuid)
returns table (provider text, model text, key_hint text, updated_at timestamptz)
language sql
security definer
set search_path = ''
stable
as $$
  select credentials.provider, credentials.model, credentials.key_hint, credentials.updated_at
    from public.herbert_api_credentials as credentials
    where credentials.user_id = p_user_id
    limit 1;
$$;

create or replace function public.herbert_delete_ai_credential(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.herbert_api_credentials where user_id = p_user_id;
$$;

revoke all on function public.herbert_store_ai_credential(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.herbert_get_ai_credential(uuid) from public, anon, authenticated;
revoke all on function public.herbert_ai_credential_status(uuid) from public, anon, authenticated;
revoke all on function public.herbert_delete_ai_credential(uuid) from public, anon, authenticated;

grant execute on function public.herbert_store_ai_credential(uuid, text, text, text, text) to service_role;
grant execute on function public.herbert_get_ai_credential(uuid) to service_role;
grant execute on function public.herbert_ai_credential_status(uuid) to service_role;
grant execute on function public.herbert_delete_ai_credential(uuid) to service_role;

drop function if exists public.herbert_store_deepseek_key(uuid, text, text);
drop function if exists public.herbert_get_deepseek_key(uuid);
drop function if exists public.herbert_deepseek_key_status(uuid);
drop function if exists public.herbert_delete_deepseek_key(uuid);
