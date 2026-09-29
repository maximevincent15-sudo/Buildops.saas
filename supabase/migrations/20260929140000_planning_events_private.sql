-- ═══════════════════════════════════════════════════════════════════════
-- Événements d'agenda (planning_blocks enrichis)
--
-- Les « blocs » du planning deviennent de vrais événements d'agenda :
--   • notes   : texte libre (lien de visio, adresse, téléphone…)
--   • is_private : visible uniquement par son auteur (défaut false pour ne
--     rien changer aux blocs existants ; l'interface crée en privé)
--   • created_by prend automatiquement l'utilisateur connecté
--
-- RLS : un événement privé n'est visible / modifiable / supprimable que par
-- son auteur ; un événement d'équipe reste partagé dans l'organisation.
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.planning_blocks add column if not exists notes text;
alter table public.planning_blocks add column if not exists is_private boolean not null default false;
alter table public.planning_blocks alter column created_by set default auth.uid();

comment on column public.planning_blocks.notes is 'Note libre de l''événement (lien de visio, adresse…).';
comment on column public.planning_blocks.is_private is 'true = visible uniquement par son auteur (created_by).';

drop policy if exists "blocks_select_org" on public.planning_blocks;
create policy "blocks_select_org"
  on public.planning_blocks for select
  to authenticated
  using (
    organization_id = public.current_user_organization_id()
    and (not is_private or created_by = (select auth.uid()))
  );

drop policy if exists "blocks_insert_org" on public.planning_blocks;
create policy "blocks_insert_org"
  on public.planning_blocks for insert
  to authenticated
  with check (
    organization_id = public.current_user_organization_id()
    and (not is_private or created_by = (select auth.uid()))
  );

drop policy if exists "blocks_update_org" on public.planning_blocks;
create policy "blocks_update_org"
  on public.planning_blocks for update
  to authenticated
  using (
    organization_id = public.current_user_organization_id()
    and (not is_private or created_by = (select auth.uid()))
  )
  with check (
    organization_id = public.current_user_organization_id()
    and (not is_private or created_by = (select auth.uid()))
  );

drop policy if exists "blocks_delete_org" on public.planning_blocks;
create policy "blocks_delete_org"
  on public.planning_blocks for delete
  to authenticated
  using (
    organization_id = public.current_user_organization_id()
    and (not is_private or created_by = (select auth.uid()))
  );
