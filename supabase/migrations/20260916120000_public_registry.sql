-- ═══════════════════════════════════════════════════════════
-- Firovia — Migration : registre APSAD public partageable
-- ═══════════════════════════════════════════════════════════
-- Ajoute un token public sur les sites pour générer une URL unique
-- partageable (transmise à la commission de sécurité par exemple).
-- Une RPC SECURITY DEFINER expose les données du registre pour
-- ce token, en contournant la RLS (accès public read-only).


-- ─── Colonne public_token sur sites ─────────────────────────
alter table public.sites
  add column if not exists public_token text unique;

-- Génère un token pour tous les sites existants sans token
update public.sites
set public_token = replace(gen_random_uuid()::text, '-', '')
where public_token is null;

-- Trigger : chaque nouveau site reçoit automatiquement un token
create or replace function public.sites_generate_public_token()
returns trigger language plpgsql as $$
begin
  if new.public_token is null then
    new.public_token := replace(gen_random_uuid()::text, '-', '');
  end if;
  return new;
end;
$$;

drop trigger if exists sites_public_token on public.sites;
create trigger sites_public_token
  before insert on public.sites
  for each row execute procedure public.sites_generate_public_token();

create index if not exists idx_sites_public_token
  on public.sites (public_token)
  where public_token is not null;


-- ─── RPC publique : registre par token ──────────────────────
-- Retourne le registre APSAD nominatif pour un site donné,
-- en contournant la RLS (SECURITY DEFINER). Accessible sans auth.
create or replace function public.get_public_registry(token text)
returns table (
  site_name         text,
  site_address      text,
  site_postal_code  text,
  site_city         text,
  client_name       text,
  unit_id           uuid,
  unit_serial       text,
  unit_family       text,
  unit_subtype      text,
  unit_brand        text,
  unit_model        text,
  unit_install_year int,
  unit_next_replacement_year int,
  unit_status       text,
  unit_last_check_date  date,
  unit_next_check_date  date,
  unit_implantation text,
  zone_name         text,
  zone_parent       text,
  zone_display_order int
)
language sql
security definer
set search_path = public
stable
as $$
  select
    s.name as site_name,
    s.address as site_address,
    s.postal_code as site_postal_code,
    s.city as site_city,
    c.name as client_name,
    u.id as unit_id,
    u.serial_number as unit_serial,
    u.family as unit_family,
    u.subtype as unit_subtype,
    u.brand as unit_brand,
    u.model as unit_model,
    u.install_year as unit_install_year,
    u.next_replacement_year as unit_next_replacement_year,
    u.status as unit_status,
    u.last_check_date as unit_last_check_date,
    u.next_check_date as unit_next_check_date,
    u.implantation as unit_implantation,
    z.name as zone_name,
    z.parent_zone as zone_parent,
    z.display_order as zone_display_order
  from public.sites s
    join public.clients c on c.id = s.client_id
    left join public.equipment_units u
      on u.site_id = s.id and u.status <> 'removed'
    left join public.zones z on z.id = u.zone_id
  where s.public_token = token
  order by z.parent_zone nulls last, z.display_order, z.name, u.family, u.serial_number;
$$;

-- Grant execute aux visiteurs anonymes ET aux utilisateurs authentifiés
grant execute on function public.get_public_registry(text) to anon, authenticated;


-- ═══════════════════════════════════════════════════════════
-- FIN — Migration registre public
-- ═══════════════════════════════════════════════════════════
