-- ============================================================================
-- Firovia — Droits du technicien (compte « member »)
-- ============================================================================
-- Jusqu'ici, toutes les règles d'accès se limitaient à « même organisation » :
-- un technicien pouvait lire devis et factures par l'API, modifier les
-- réglages, et valider ses propres frais. Désormais :
--   - devis, factures (et leurs lignes) : administrateurs uniquement ;
--   - réglages de l'organisation, mentions de facturation, fiches techniciens,
--     catalogue, invitations : modification par les administrateurs ;
--   - frais et heures sup : le technicien saisit, seul un administrateur
--     valide ou refuse (trigger).
-- Les fonctions SECURITY DEFINER (références, liaison du compte, acceptation
-- d'invitation…) ne sont pas concernées. Pas de nouvelle table : pas de GRANT.
-- Au 22/10/2026, tous les comptes existants sont administrateurs.
-- ============================================================================

-- ─── Devis / factures : administrateurs ────────────────────────────────────
drop policy if exists quotes_select_org on public.quotes;
drop policy if exists quotes_insert_org on public.quotes;
drop policy if exists quotes_update_org on public.quotes;
drop policy if exists quotes_delete_org on public.quotes;
create policy quotes_select_org on public.quotes for select to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy quotes_insert_org on public.quotes for insert to authenticated
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy quotes_update_org on public.quotes for update to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin())
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy quotes_delete_org on public.quotes for delete to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

drop policy if exists quote_lines_select_org on public.quote_lines;
drop policy if exists quote_lines_insert_org on public.quote_lines;
drop policy if exists quote_lines_update_org on public.quote_lines;
drop policy if exists quote_lines_delete_org on public.quote_lines;
create policy quote_lines_select_org on public.quote_lines for select to authenticated
  using (public.current_user_is_org_admin() and exists (select 1 from public.quotes q where q.id = quote_lines.quote_id and q.organization_id = public.current_user_organization_id()));
create policy quote_lines_insert_org on public.quote_lines for insert to authenticated
  with check (public.current_user_is_org_admin() and exists (select 1 from public.quotes q where q.id = quote_lines.quote_id and q.organization_id = public.current_user_organization_id()));
create policy quote_lines_update_org on public.quote_lines for update to authenticated
  using (public.current_user_is_org_admin() and exists (select 1 from public.quotes q where q.id = quote_lines.quote_id and q.organization_id = public.current_user_organization_id()))
  with check (public.current_user_is_org_admin() and exists (select 1 from public.quotes q where q.id = quote_lines.quote_id and q.organization_id = public.current_user_organization_id()));
create policy quote_lines_delete_org on public.quote_lines for delete to authenticated
  using (public.current_user_is_org_admin() and exists (select 1 from public.quotes q where q.id = quote_lines.quote_id and q.organization_id = public.current_user_organization_id()));

drop policy if exists invoices_select_org on public.invoices;
drop policy if exists invoices_insert_org on public.invoices;
drop policy if exists invoices_update_org on public.invoices;
drop policy if exists invoices_delete_org on public.invoices;
create policy invoices_select_org on public.invoices for select to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy invoices_insert_org on public.invoices for insert to authenticated
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy invoices_update_org on public.invoices for update to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin())
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy invoices_delete_org on public.invoices for delete to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

drop policy if exists invoice_lines_select_org on public.invoice_lines;
drop policy if exists invoice_lines_insert_org on public.invoice_lines;
drop policy if exists invoice_lines_update_org on public.invoice_lines;
drop policy if exists invoice_lines_delete_org on public.invoice_lines;
create policy invoice_lines_select_org on public.invoice_lines for select to authenticated
  using (public.current_user_is_org_admin() and exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id and i.organization_id = public.current_user_organization_id()));
create policy invoice_lines_insert_org on public.invoice_lines for insert to authenticated
  with check (public.current_user_is_org_admin() and exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id and i.organization_id = public.current_user_organization_id()));
create policy invoice_lines_update_org on public.invoice_lines for update to authenticated
  using (public.current_user_is_org_admin() and exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id and i.organization_id = public.current_user_organization_id()))
  with check (public.current_user_is_org_admin() and exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id and i.organization_id = public.current_user_organization_id()));
create policy invoice_lines_delete_org on public.invoice_lines for delete to authenticated
  using (public.current_user_is_org_admin() and exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id and i.organization_id = public.current_user_organization_id()));

-- ─── Réglages de l'organisation : modification par les administrateurs ─────
drop policy if exists orgs_update_own on public.organizations;
create policy orgs_update_own on public.organizations for update to authenticated
  using (id = public.current_user_organization_id() and public.current_user_is_org_admin());

drop policy if exists invoicing_settings_insert_org on public.organization_invoicing_settings;
drop policy if exists invoicing_settings_update_org on public.organization_invoicing_settings;
create policy invoicing_settings_insert_org on public.organization_invoicing_settings for insert to authenticated
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy invoicing_settings_update_org on public.organization_invoicing_settings for update to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin())
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

-- ─── Fiches techniciens, catalogue, invitations : écriture administrateur ──
drop policy if exists tech_insert_org on public.technicians;
drop policy if exists tech_update_org on public.technicians;
drop policy if exists tech_delete_org on public.technicians;
create policy tech_insert_org on public.technicians for insert to authenticated
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy tech_update_org on public.technicians for update to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin())
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy tech_delete_org on public.technicians for delete to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

drop policy if exists catalog_items_insert_org on public.catalog_items;
drop policy if exists catalog_items_update_org on public.catalog_items;
drop policy if exists catalog_items_delete_org on public.catalog_items;
create policy catalog_items_insert_org on public.catalog_items for insert to authenticated
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy catalog_items_update_org on public.catalog_items for update to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin())
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy catalog_items_delete_org on public.catalog_items for delete to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

drop policy if exists invitations_insert_org on public.organization_invitations;
drop policy if exists invitations_update_org on public.organization_invitations;
drop policy if exists invitations_delete_org on public.organization_invitations;
create policy invitations_insert_org on public.organization_invitations for insert to authenticated
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy invitations_update_org on public.organization_invitations for update to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin())
  with check (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());
create policy invitations_delete_org on public.organization_invitations for delete to authenticated
  using (organization_id = public.current_user_organization_id() and public.current_user_is_org_admin());

-- ─── Frais et heures sup : seul un administrateur valide ou refuse ─────────
create or replace function public.protect_validation_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Appels serveur (sans utilisateur) et administrateurs : pas de restriction
  if auth.uid() is null or public.current_user_is_org_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
  elsif new.status is distinct from old.status then
    raise exception 'Seul un administrateur peut valider ou refuser.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_validation_status() from public, anon, authenticated;

drop trigger if exists expenses_protect_status on public.expenses;
create trigger expenses_protect_status
  before insert or update on public.expenses
  for each row execute function public.protect_validation_status();

drop trigger if exists overtime_protect_status on public.overtime_hours;
create trigger overtime_protect_status
  before insert or update on public.overtime_hours
  for each row execute function public.protect_validation_status();
