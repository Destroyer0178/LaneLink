begin;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    organization
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'organization', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_auth_user() is
  'Creates a LaneLink coach profile from safe signup metadata after Supabase Auth creates the user.';

insert into public.profiles (
  id,
  display_name,
  organization
)
select
  auth_user.id,
  coalesce(auth_user.raw_user_meta_data ->> 'display_name', ''),
  coalesce(auth_user.raw_user_meta_data ->> 'organization', '')
from auth.users auth_user
on conflict (id) do nothing;

commit;
