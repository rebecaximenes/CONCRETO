# Plano de Desenvolvimento — RastreConcreto

> **Backend:** Supabase (PostgreSQL + RLS + Auth + Storage + Edge Functions + Realtime + Cron via pg_cron).
> **Build do frontend:** Lovable + Supabase (React + Tailwind + shadcn/ui, PWA com captura de foto e funcionamento offline).
>
> Este plano transforma a planilha de Excel que "demanda muito tempo para alimentar" numa plataforma que rastreia cada concretagem do recebimento do caminhão betoneira até os ensaios de 7 e 28 dias, com leitura automática de nota fiscal e laudo por IA. São 3 fases, na ordem de dependência: primeiro a fundação (banco + login + esqueleto), depois as funcionalidades reais (recebimento, lançamento, aprovação, laudos com IA, alertas), e por fim polimento e lançamento (offline, relatórios, deploy).

---

## Fase 1 — Fundação

**Entregável:** projeto no ar com banco completo, login funcionando e o esqueleto de navegação, pronto para receber as telas de campo.

**Tabelas:** todas do `db/schemas.sql` (`profiles`, `sites`, `site_members`, `concrete_mixes`, `pieces`, `concretings`, `truck_receipts`, `placement_records`, `placement_photos`, `test_reports`, `strength_results`, `nonconformity_alerts`, `pending_tests`, `audit_log`).
**Páginas:** `/login`, `/` (dashboard vazio), layout base + navegação.
**Functions/triggers:** `handle_new_user()`, funções helper de RLS (`is_site_member`, `is_production_manager`, `current_profile_role`), buckets de Storage (`invoice-photos`, `placement-photos`, `test-reports`).

**Checklist:**
- [ ] Criar o projeto no Lovable conectado ao Supabase
- [ ] Rodar `db/schemas.sql` no Supabase (todas as tabelas, índices, RLS e triggers)
- [ ] Configurar Auth (email/senha + magic link) e trigger `handle_new_user`
- [ ] Criar os 3 buckets privados de Storage com políticas por obra
- [ ] Montar layout base, menu de navegação por papel e página `/login`
- [ ] Criar dashboard `/` inicial (estrutura vazia por obra)

---

## Fase 2 — Construção

**Entregável:** o fluxo completo do concreto funcionando — cadastros, recebimento com OCR da NF, lançamento na laje com foto, fila de aprovação do gestor, upload de laudo com leitura automática por IA e alertas de não conformidade.

**Páginas:** `/obras`, `/obras/:siteId/traços`, `/obras/:siteId/pecas`, `/concretagens`, `/concretagens/nova`, `/recebimento/:concretingId`, `/lancamento/:concretingId`, `/concretagens/:id`, `/aprovacoes`, `/laudos`, `/alertas`, `/pendencias`.
**Tabelas:** `sites`, `site_members`, `concrete_mixes`, `pieces`, `concretings`, `truck_receipts`, `placement_records`, `placement_photos`, `test_reports`, `strength_results`, `nonconformity_alerts`, `pending_tests`.
**Functions:** `extract-invoice-ocr`, `extract-test-report`, `match-report-to-concreting`, `evaluate-conformity`, `notify-manager`; RPCs/triggers `approve_concreting`, `create_pending_tests`, `set_conformity_flag`.

**Checklist:**
- [ ] Telas de obras, membros, traços e peças (cadastros base do gestor)
- [ ] Fluxo de concretagem: `/concretagens/nova`, lista e detalhe `/concretagens/:id`
- [ ] Tela de recebimento com foto da NF + Edge Function `extract-invoice-ocr`
- [ ] Tela de lançamento na laje com seleção de peça, responsável e fotos
- [ ] Fila de aprovação `/aprovacoes` + RPC `approve_concreting`
- [ ] Upload de laudos `/laudos` + `extract-test-report` + `match-report-to-concreting`
- [ ] Alertas de não conformidade + pendências (`evaluate-conformity`, triggers)

---

## Fase 3 — Polimento e lançamento

**Entregável:** app robusto para uso em obra — funciona offline com sincronização, relatórios de conformidade e tendências, notificações automáticas e deploy publicado.

**Páginas:** `/relatorios`, `/configuracoes`, refino de estados (vazio/erro/loading) em todas as telas.
**Functions:** `sync-offline-batch`, `generate-conformity-report`, `export-spreadsheet`, `notify-manager`; cron `cron-check-overdue-tests`.

**Checklist:**
- [ ] Implementar modo offline (PWA) + `sync-offline-batch` com dedupe por `client_local_id`
- [ ] Relatórios `/relatorios`: conformidade/tendências (IA) + `export-spreadsheet`
- [ ] Notificações por email (Resend) e cron de ensaios em atraso
- [ ] Estados vazio/erro/loading, responsividade mobile/tablet e revisão de RLS
- [ ] Testes de ponta a ponta e deploy do app publicado
