# Estrutura Técnica — RastreConcreto

> **Backend:** Supabase (PostgreSQL + RLS + Auth + Storage + Edge Functions + Realtime + Cron via pg_cron). Não negociável.
>
> **Caminho de build do frontend: Lovable + Supabase.** Você descreveu uma equipe de **técnicos de edificações** e **gestor de produção** — nenhum time de TI ou capacidade de codar foi mencionado, e o objetivo é sair rápido da planilha de Excel que "demanda muito tempo para alimentar". Nesse cenário, o Lovable é o caminho mais rápido e sustentável: gera React + Tailwind + shadcn/ui com integração nativa ao Supabase, incluindo captura de foto pelo celular/tablet, PWA para o funcionamento **offline com sincronização posterior** que a obra exige, e deploy com preview. Toda a lógica pesada (OCR de nota fiscal, leitura de laudo em PDF, alertas de não conformidade) fica em Edge Functions server-side — que funcionam idênticas nos dois caminhos, então não há amarra de vendor no lado da inteligência.

---

## 1. Modelo de dados

### `profiles`
Propósito: estende `auth.users` com dados do profissional e seu papel na obra.
- `id` uuid PK — FK → `auth.users(id)`
- `full_name` text NOT NULL
- `email` text NOT NULL
- `role` text NOT NULL default `'field_tech'` — valores: `receiving_tech`, `slab_tech`, `field_tech`, `production_manager`
- `phone` text
- `is_active` boolean NOT NULL default `true`
- `created_at` timestamptz NOT NULL default `now()`
- Índices: `idx_profiles_role (role)`, `idx_profiles_email (email)`

### `sites`
Propósito: obra/canteiro onde as concretagens acontecem.
- `id` uuid PK default `gen_random_uuid()`
- `name` text NOT NULL
- `code` text — código interno da obra
- `address` text
- `is_active` boolean NOT NULL default `true`
- `created_by` uuid FK → `profiles(id)`
- `created_at` timestamptz NOT NULL default `now()`
- Índices: `idx_sites_created_by (created_by)`, `idx_sites_is_active (is_active)`

### `site_members`
Propósito: associa profissionais às obras que podem acessar (multi-obra).
- `id` uuid PK default `gen_random_uuid()`
- `site_id` uuid NOT NULL FK → `sites(id)`
- `profile_id` uuid NOT NULL FK → `profiles(id)`
- `site_role` text NOT NULL default `'field_tech'` — papel dentro daquela obra
- `created_at` timestamptz NOT NULL default `now()`
- Índices: `idx_site_members_site (site_id)`, `idx_site_members_profile (profile_id)`, `uniq_site_members (site_id, profile_id)` UNIQUE

### `concrete_mixes`
Propósito: cadastro dos traços/dosagens de concreto com o fck de projeto.
- `id` uuid PK default `gen_random_uuid()`
- `site_id` uuid NOT NULL FK → `sites(id)`
- `name` text NOT NULL — identificação do traço
- `fck_required` numeric(6,2) NOT NULL — fck exigido em MPa
- `supplier` text — central de concreto
- `notes` text
- `created_at` timestamptz NOT NULL default `now()`
- Índices: `idx_concrete_mixes_site (site_id)`

### `concretings`
Propósito: representa uma concretagem (evento do dia) que agrega recebimentos e lançamentos e passa por aprovação.
- `id` uuid PK default `gen_random_uuid()`
- `site_id` uuid NOT NULL FK → `sites(id)`
- `concreting_date` date NOT NULL default `current_date`
- `title` text — ex.: "Laje 3º pavimento"
- `status` text NOT NULL default `'in_progress'` — `in_progress`, `pending_approval`, `approved`, `rejected`
- `approved_by` uuid FK → `profiles(id)`
- `approved_at` timestamptz
- `created_by` uuid NOT NULL FK → `profiles(id)`
- `client_local_id` text — id gerado no dispositivo para deduplicação offline
- `created_at` timestamptz NOT NULL default `now()`
- `synced_at` timestamptz
- Índices: `idx_concretings_site (site_id)`, `idx_concretings_status (status)`, `idx_concretings_date (concreting_date desc)`, `idx_concretings_created_by (created_by)`, `uniq_concretings_client_local (created_by, client_local_id)` UNIQUE

### `truck_receipts`
Propósito: registro de recebimento de cada caminhão betoneira feito pelo técnico de recebimento in loco.
- `id` uuid PK default `gen_random_uuid()`
- `concreting_id` uuid NOT NULL FK → `concretings(id)`
- `invoice_number` text NOT NULL — número da nota fiscal (chave de vínculo com laudos)
- `truck_number` text NOT NULL — número do caminhão betoneira
- `concrete_mix_id` uuid FK → `concrete_mixes(id)`
- `fck_required` numeric(6,2) NOT NULL — fck do traço recebido (snapshot)
- `slump_value` numeric(5,1) NOT NULL — resultado do slump test (cm)
- `temperature` numeric(5,1) — obrigatória apenas para peças especiais (ver regra)
- `is_special_piece` boolean NOT NULL default `false`
- `invoice_photo_path` text — Storage: foto da NF
- `ocr_status` text NOT NULL default `'pending'` — `pending`, `processing`, `done`, `failed`
- `received_by` uuid NOT NULL FK → `profiles(id)`
- `client_local_id` text
- `created_at` timestamptz NOT NULL default `now()`
- `synced_at` timestamptz
- Índices: `idx_truck_receipts_concreting (concreting_id)`, `idx_truck_receipts_invoice (invoice_number)`, `idx_truck_receipts_mix (concrete_mix_id)`, `idx_truck_receipts_received_by (received_by)`, `uniq_truck_receipts_client_local (received_by, client_local_id)` UNIQUE

### `pieces`
Propósito: catálogo de peças/locais que podem ser concretados na obra (peça a ser concretada).
- `id` uuid PK default `gen_random_uuid()`
- `site_id` uuid NOT NULL FK → `sites(id)`
- `name` text NOT NULL — ex.: "Pilar P12", "Laje L3"
- `fck_required` numeric(6,2) NOT NULL — fck exigido pela peça (base do alerta de não conformidade)
- `is_special` boolean NOT NULL default `false` — peça especial exige temperatura
- `location_description` text
- `created_at` timestamptz NOT NULL default `now()`
- Índices: `idx_pieces_site (site_id)`, `idx_pieces_is_special (is_special)`

### `placement_records`
Propósito: registro de lançamento do concreto numa peça, feito pelo técnico de rastreabilidade na laje.
- `id` uuid PK default `gen_random_uuid()`
- `concreting_id` uuid NOT NULL FK → `concretings(id)`
- `piece_id` uuid NOT NULL FK → `pieces(id)`
- `truck_receipt_id` uuid FK → `truck_receipts(id)` — caminhão de origem do lançamento
- `responsible_tech_id` uuid NOT NULL FK → `profiles(id)` — responsável técnico do lançamento
- `placed_at` timestamptz NOT NULL default `now()`
- `notes` text
- `recorded_by` uuid NOT NULL FK → `profiles(id)`
- `client_local_id` text
- `synced_at` timestamptz
- `created_at` timestamptz NOT NULL default `now()`
- Índices: `idx_placement_records_concreting (concreting_id)`, `idx_placement_records_piece (piece_id)`, `idx_placement_records_receipt (truck_receipt_id)`, `idx_placement_records_responsible (responsible_tech_id)`, `uniq_placement_client_local (recorded_by, client_local_id)` UNIQUE

### `placement_photos`
Propósito: fotos capturadas do lançamento/peça, guardadas e vinculadas ao registro.
- `id` uuid PK default `gen_random_uuid()`
- `placement_record_id` uuid NOT NULL FK → `placement_records(id)`
- `storage_path` text NOT NULL — caminho no bucket
- `caption` text
- `created_at` timestamptz NOT NULL default `now()`
- Índices: `idx_placement_photos_record (placement_record_id)`

### `test_reports`
Propósito: laudo de ensaio em PDF enviado pelo gestor, que a IA lê para preencher os resultados.
- `id` uuid PK default `gen_random_uuid()`
- `site_id` uuid NOT NULL FK → `sites(id)`
- `storage_path` text NOT NULL — PDF no bucket
- `invoice_number` text — número da NF extraído do laudo (chave de vínculo)
- `matched_truck_receipt_id` uuid FK → `truck_receipts(id)` — vínculo resolvido pela NF
- `extraction_status` text NOT NULL default `'pending'` — `pending`, `processing`, `done`, `needs_review`, `failed`
- `raw_extraction` jsonb — payload bruto retornado pela IA
- `uploaded_by` uuid NOT NULL FK → `profiles(id)`
- `created_at` timestamptz NOT NULL default `now()`
- Índices: `idx_test_reports_site (site_id)`, `idx_test_reports_invoice (invoice_number)`, `idx_test_reports_receipt (matched_truck_receipt_id)`, `idx_test_reports_status (extraction_status)`

### `strength_results`
Propósito: resultado de resistência de um corpo de prova nos marcos de 7 e 28 dias, extraído do laudo.
- `id` uuid PK default `gen_random_uuid()`
- `test_report_id` uuid NOT NULL FK → `test_reports(id)`
- `truck_receipt_id` uuid FK → `truck_receipts(id)`
- `piece_id` uuid FK → `pieces(id)`
- `age_days` int NOT NULL — `7` ou `28`
- `measured_fck` numeric(6,2) NOT NULL — fck medido (MPa)
- `required_fck` numeric(6,2) NOT NULL — fck exigido (snapshot da peça/traço)
- `is_conforming` boolean NOT NULL — `measured_fck >= required_fck`
- `test_date` date
- `created_at` timestamptz NOT NULL default `now()`
- Índices: `idx_strength_results_report (test_report_id)`, `idx_strength_results_receipt (truck_receipt_id)`, `idx_strength_results_piece (piece_id)`, `idx_strength_results_conforming (is_conforming)`, `idx_strength_results_age (age_days)`

### `nonconformity_alerts`
Propósito: alerta gerado quando o fck medido fica abaixo do exigido (aos 7 ou 28 dias).
- `id` uuid PK default `gen_random_uuid()`
- `site_id` uuid NOT NULL FK → `sites(id)`
- `strength_result_id` uuid NOT NULL FK → `strength_results(id)`
- `truck_receipt_id` uuid FK → `truck_receipts(id)`
- `age_days` int NOT NULL
- `measured_fck` numeric(6,2) NOT NULL
- `required_fck` numeric(6,2) NOT NULL
- `severity` text NOT NULL default `'high'`
- `status` text NOT NULL default `'open'` — `open`, `acknowledged`, `resolved`
- `acknowledged_by` uuid FK → `profiles(id)`
- `created_at` timestamptz NOT NULL default `now()`
- Índices: `idx_nc_alerts_site (site_id)`, `idx_nc_alerts_status (status)`, `idx_nc_alerts_result (strength_result_id)`

### `pending_tests`
Propósito: controla pendências de ensaios ainda não recebidos (7 ou 28 dias) até o fechamento do lote.
- `id` uuid PK default `gen_random_uuid()`
- `truck_receipt_id` uuid NOT NULL FK → `truck_receipts(id)`
- `age_days` int NOT NULL — `7` ou `28`
- `due_date` date NOT NULL — data esperada do resultado
- `is_received` boolean NOT NULL default `false`
- `received_at` timestamptz
- Índices: `idx_pending_tests_receipt (truck_receipt_id)`, `idx_pending_tests_due (due_date)`, `idx_pending_tests_open (is_received) WHERE is_received = false`

### `audit_log`
Propósito: trilha de auditoria de aprovações e alterações sensíveis.
- `id` uuid PK default `gen_random_uuid()`
- `actor_id` uuid FK → `profiles(id)`
- `entity` text NOT NULL — nome da tabela
- `entity_id` uuid NOT NULL
- `action` text NOT NULL — `approve`, `reject`, `update`, `alert`
- `details` jsonb
- `created_at` timestamptz NOT NULL default `now()`
- Índices: `idx_audit_entity (entity, entity_id)`, `idx_audit_actor (actor_id)`

---

## 2. RLS e autenticação

**Autenticação:** Supabase Auth por **email/senha** como método principal (equipe de campo com login simples) e **magic link** como opção para acesso do gestor no escritório sem gerenciar senha. OAuth não é necessário neste primeiro momento (não há cliente externo, conforme suposição do processo). Cada usuário tem um registro em `profiles` criado por trigger `handle_new_user` após signup. O papel efetivo por obra vem de `site_members.site_role`.

Funções helper (SECURITY DEFINER) para as políticas: `is_site_member(site_id)`, `is_production_manager(site_id)`, `current_profile_role()`.

- **`profiles`**: SELECT — o próprio usuário e gestores da mesma obra; INSERT — via trigger de signup; UPDATE — o próprio usuário (dados básicos) e gestor (campo `role`/`is_active`); DELETE — ninguém (desativar via `is_active`).
- **`sites`**: SELECT — membros da obra (`is_site_member`); INSERT/UPDATE — gestor de produção; DELETE — nenhum (usar `is_active`).
- **`site_members`**: SELECT — membros da mesma obra; INSERT/UPDATE/DELETE — gestor de produção da obra.
- **`concrete_mixes`** / **`pieces`**: SELECT — membros da obra; INSERT/UPDATE — gestor de produção; DELETE — gestor de produção.
- **`concretings`**: SELECT — membros da obra; INSERT — qualquer técnico membro da obra; UPDATE — o criador enquanto `in_progress` e o gestor (para aprovar/rejeitar, campos `status`/`approved_by`/`approved_at`); DELETE — gestor de produção.
- **`truck_receipts`**: SELECT — membros da obra; INSERT — técnicos membros (recebimento); UPDATE — o `received_by` enquanto a concretagem não estiver aprovada, e Edge Function (OCR) via service role; DELETE — gestor.
- **`placement_records`** / **`placement_photos`**: SELECT — membros da obra; INSERT — técnicos membros (rastreabilidade na laje); UPDATE — o `recorded_by` enquanto não aprovado; DELETE — o `recorded_by` (enquanto não aprovado) ou gestor.
- **`test_reports`** / **`strength_results`**: SELECT — membros da obra; INSERT — gestor (upload) e Edge Function (extração via service role); UPDATE — Edge Function e gestor (revisão de `needs_review`); DELETE — gestor.
- **`nonconformity_alerts`**: SELECT — membros da obra; INSERT — apenas Edge Function/trigger (service role); UPDATE — gestor (acknowledge/resolve); DELETE — nenhum.
- **`pending_tests`**: SELECT — membros da obra; INSERT/UPDATE — Edge Function/cron (service role); DELETE — gestor.
- **`audit_log`**: SELECT — gestor de produção; INSERT — service role/triggers; UPDATE/DELETE — ninguém.
- **Storage buckets** (`invoice-photos`, `placement-photos`, `test-reports`): privados; políticas de acesso restritas a membros da obra dona do registro; upload por técnicos/gestores membros; leitura via URLs assinadas geradas server-side.

---

## 3. Functions/endpoints

**Edge Functions (Deno, kebab-case):**

- **`extract-invoice-ocr`** — recebe a foto da NF (`invoice_photo_path`), chama a IA de visão para extrair o **número da nota fiscal** e devolve para preencher `truck_receipts.invoice_number`, atualizando `ocr_status`. Chamada logo após o upload da foto no recebimento.
- **`extract-test-report`** — lê o PDF do laudo (`test_reports.storage_path`), extrai número da NF, idade (7/28 dias) e fck medido, grava em `strength_results` e resolve `matched_truck_receipt_id` pela NF. Chamada quando o gestor envia o laudo. Atualiza `extraction_status` (`done`/`needs_review`).
- **`match-report-to-concreting`** — dado o `invoice_number` extraído, localiza o `truck_receipt` correspondente e vincula laudo/resultados; marca `needs_review` se não houver match único. Chamada por `extract-test-report`.
- **`evaluate-conformity`** — para cada `strength_results` inserido, compara `measured_fck` com `required_fck`; se menor, cria `nonconformity_alert` e marca `pending_tests` como recebido. Também dispara notificação ao gestor. Acionada após a extração (ou via trigger).
- **`sync-offline-batch`** — recebe o lote de registros criados offline (concretings/receipts/placements com `client_local_id`), faz upsert idempotente por `client_local_id`, dispara OCR pendente. Chamada quando o dispositivo recupera conexão.
- **`generate-conformity-report`** — gera relatório de conformidade e análise de tendência de qualidade (usando IA para o texto em linguagem natural) a partir do histórico de `strength_results`/`concretings`. Chamada pelo gestor sob demanda.
- **`export-spreadsheet`** — exporta os dados estruturados da(s) concretagem(ns) em planilha (substitui/espelha o Excel atual). Chamada pelo gestor.
- **`notify-manager`** — envia notificação/email (via Resend) de nova aprovação pendente ou alerta de não conformidade.

**Postgres RPCs / triggers:**

- **`approve_concreting(concreting_id)`** — valida completude do recebimento (FCK, NF, caminhão, slump) antes de marcar `approved`, grava `approved_by`/`approved_at` e loga em `audit_log`.
- **`handle_new_user()`** (trigger) — cria `profiles` após signup.
- **`create_pending_tests()`** (trigger em `truck_receipts`) — ao criar recebimento, gera as pendências de ensaio de 7 e 28 dias com `due_date`.
- **`set_conformity_flag()`** (trigger em `strength_results`) — calcula `is_conforming` e aciona `evaluate-conformity`.

**Cron (pg_cron):**

- **`cron-check-overdue-tests`** (diário) — varre `pending_tests` vencidas e não recebidas e notifica o gestor sobre ensaios em atraso (7/28 dias).

---

## 4. Páginas do frontend

- **`/login`** — autenticação por email/senha e magic link.
- **`/`** (dashboard) — visão geral por obra: concretagens do dia, pendências de ensaio e alertas de não conformidade em destaque.
- **`/obras`** — lista de obras (`sites`) que o usuário acessa; gestor cria/edita.
- **`/obras/:siteId/traços`** — cadastro de traços (`concrete_mixes`) com fck exigido.
- **`/obras/:siteId/pecas`** — cadastro de peças/locais (`pieces`), marcando peças especiais.
- **`/concretagens`** — lista de concretagens com status; filtro por data/obra.
- **`/concretagens/nova`** — inicia uma nova concretagem no dispositivo (funciona offline).
- **`/recebimento/:concretingId`** — tela do técnico de recebimento: foto da NF (OCR), número do caminhão, slump, temperatura (peças especiais), fck do traço; salva offline e sincroniza.
- **`/lancamento/:concretingId`** — tela do técnico na laje: seleciona peça, associa responsável técnico, captura fotos do lançamento; funciona offline.
- **`/concretagens/:id`** — detalhe completo da concretagem: recebimentos, lançamentos, fotos e status de aprovação.
- **`/aprovacoes`** — fila do gestor com concretagens `pending_approval` para revisar e aprovar/rejeitar.
- **`/laudos`** — upload de laudos em PDF; acompanha status de extração e resultados de 7/28 dias.
- **`/alertas`** — lista de alertas de não conformidade (fck abaixo do exigido) para acknowledge/resolver.
- **`/pendencias`** — ensaios ainda não recebidos (7/28 dias) por lote/concretagem.
- **`/relatorios`** — relatórios de conformidade e tendências, com geração em linguagem natural e exportação de planilha.
- **`/configuracoes`** — perfil, membros da obra e papéis.

---

## 5. Integrações externas

Todas via Supabase Edge Function (nunca direto do frontend), usando secrets no Supabase.

- **API de visão/OCR — Gemini 3.5 Flash (Google):** *(o `gemini-2.5-pro` originalmente previsto saiu de linha para chaves novas; ver `docs/DEPLOY.md`)* leitura da foto da **nota fiscal** e do **laudo em PDF** (multimodal nativo, contexto longo para PDFs completos, custo baixo). Extrai número da NF, idade do ensaio e fck medido. É o motor do preenchimento automático que substitui a digitação no Excel.
- **API de IA para texto — Claude Haiku 4.5 (Anthropic):** geração dos **relatórios de conformidade em linguagem natural** e resumos de tendência a partir do histórico — rápido e barato para esse volume operacional. Para relatórios analíticos mais profundos sob demanda, escalar pontualmente para Claude Sonnet 4.6.
- **Resend (email):** notificações ao **gestor de produção** — nova concretagem aguardando aprovação, alerta de não conformidade e ensaios em atraso. Free tier (100/dia) atende o volume descrito de uma equipe de obra.

> **Custos estimados (volume de uma equipe de obra):** Lovable Pro R$95/mês + Supabase Pro R$125/mês (recomendado por causa de Storage de PDFs/fotos e Edge Functions) + uso de IA (OCR/laudos e relatórios) tipicamente na casa de poucos dólares/mês dado o baixo número de documentos por concretagem + Resend Free. Storage e Edge Functions justificam sair do Free do Supabase assim que o volume de fotos/laudos crescer.
