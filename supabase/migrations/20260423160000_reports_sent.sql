-- ═══════════════════════════════════════════════════════════
-- BuildOps — Migration 016 : traçabilité envoi rapport client
-- ═══════════════════════════════════════════════════════════
-- Un rapport peut être envoyé au client (via la messagerie du patron
-- en V1, via Resend en V2). On garde trace du destinataire et de la
-- date pour afficher un badge "envoyé le X à Y".

alter table public.reports
  add column if not exists sent_to_email text,
  add column if not exists sent_at timestamptz;
