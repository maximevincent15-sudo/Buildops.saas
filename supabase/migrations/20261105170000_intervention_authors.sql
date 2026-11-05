-- ═══════════════════════════════════════════════════════════
-- Visites : qui l'a créée, qui l'a modifiée en dernier
--
-- created_by existait mais n'était jamais rempli. Désormais la base pose :
-- - à la création : created_by = compte connecté ;
-- - à chaque modification par un compte : updated_by et updated_at.
-- Valeurs posées par la base (pas falsifiables depuis l'app) ; created_by ne
-- change plus après la création. Les scripts lancés sans compte (service)
-- ne touchent pas ces champs. Les visites existantes restent sans auteur.
--
-- Colonnes ajoutées à une table existante : RLS et droits inchangés.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════

alter table public.interventions
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz;

comment on column public.interventions.created_by is 'Compte qui a créé la visite (posé par la base)';
comment on column public.interventions.updated_by is 'Dernier compte qui a modifié la visite (posé par la base)';

create or replace function public.set_intervention_authors()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    new.updated_by := null;
    new.updated_at := null;
    return new;
  end if;

  -- Modification : l'auteur de la création ne change jamais
  new.created_by := old.created_by;
  if auth.uid() is not null then
    new.updated_by := auth.uid();
    new.updated_at := now();
  else
    new.updated_by := old.updated_by;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists interventions_set_authors on public.interventions;
create trigger interventions_set_authors
  before insert or update on public.interventions
  for each row execute function public.set_intervention_authors();

revoke execute on function public.set_intervention_authors() from public, anon, authenticated;
grant execute on function public.set_intervention_authors() to service_role;
