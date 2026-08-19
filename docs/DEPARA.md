# DE-PARA — RastreConcreto

> Matriz de rastreabilidade que liga **banco (tabelas)** ↔ **backend (Edge Functions / RPCs / triggers / cron)** ↔ **frontend (páginas)**. Nomes idênticos aos de `docs/ESTRUTURA.md`. Serve para conferir que nenhuma tabela, function ou página ficou órfã.

---

## 1. Tabela (DB) → Functions/Endpoints → Páginas

| Tabela | Functions/Endpoints que a tocam | Páginas que a usam | Observação |
|---|---|---|---|
| `profiles` | `handle_new_user()` (trigger, INSERT), `approve_concreting()` (leitura de papel), `notify-manager` (destinatário), `current_profile_role()` / `is_production_manager()` (helpers RLS) | `/login`, `/configuracoes`, `/` | Estende `auth.users`; papel efetivo por obra vem de `site_members.site_role`. |
| `sites` | `generate-conformity-report` (escopo), `export-spreadsheet` (escopo), `is_site_member()` (helper RLS) | `/obras`, `/`, `/configuracoes` | Escopo raiz de toda a segurança multi-obra; gestor cria/edita. |
| `site_members` | `is_site_member()`, `is_production_manager()` (helpers RLS) | `/configuracoes`, `/obras` | Define quem acessa cada obra e o `site_role` por obra. |
| `concrete_mixes` | — (CRUD via PostgREST) | `/obras/:siteId/traços`, `/recebimento/:concretingId` | Fonte do `fck_required` copiado (snapshot) para `truck_receipts`. |
| `concretings` | `approve_concreting()` (RPC, UPDATE status), `sync-offline-batch` (upsert idempotente), `generate-conformity-report`, `export-spreadsheet`, `notify-manager` | `/concretagens`, `/concretagens/nova`, `/concretagens/:id`, `/aprovacoes`, `/recebimento/:concretingId`, `/lancamento/:concretingId`, `/` | Agrega recebimentos + lançamentos; dedup offline por `uniq_concretings_client_local`. |
| `truck_receipts` | `extract-invoice-ocr` (UPDATE `invoice_number`/`ocr_status`), `sync-offline-batch` (upsert), `match-report-to-concreting` (vínculo por NF), `create_pending_tests()` (trigger AFTER INSERT), `approve_concreting()` (validação de completude), `export-spreadsheet` | `/recebimento/:concretingId`, `/concretagens/:id`, `/laudos` | `invoice_number` é a chave de vínculo com laudos; snapshot de `fck_required`. |
| `pieces` | `evaluate-conformity` (leitura de `fck_required`), `export-spreadsheet` | `/obras/:siteId/pecas`, `/lancamento/:concretingId`, `/concretagens/:id` | `is_special` define exigência de temperatura; `fck_required` é base do alerta de NC. |
| `placement_records` | `sync-offline-batch` (upsert), `export-spreadsheet` | `/lancamento/:concretingId`, `/concretagens/:id` | Liga peça ↔ caminhão ↔ responsável técnico; dedup por `uniq_placement_client_local`. |
| `placement_photos` | `sync-offline-batch` (associa foto ao registro) | `/lancamento/:concretingId`, `/concretagens/:id` | Fotos em bucket `placement-photos`; leitura via URL assinada server-side. |
| `test_reports` | `extract-test-report` (INSERT/UPDATE `extraction_status`/`raw_extraction`), `match-report-to-concreting` (UPDATE `matched_truck_receipt_id`) | `/laudos` | PDF enviado pelo gestor no bucket `test-reports`; motor do preenchimento automático. |
| `strength_results` | `extract-test-report` (INSERT), `set_conformity_flag()` (trigger, calcula `is_conforming`), `evaluate-conformity`, `generate-conformity-report` | `/laudos`, `/relatorios`, `/concretagens/:id` | Resultados 7/28 dias extraídos do laudo; base de conformidade e tendências. |
| `nonconformity_alerts` | `evaluate-conformity` (INSERT via service role), `notify-manager` (envio), `set_conformity_flag()` (disparo) | `/alertas`, `/` | Criado só por Edge Function/trigger; gestor faz acknowledge/resolve. |
| `pending_tests` | `create_pending_tests()` (trigger, INSERT 7 e 28 dias), `evaluate-conformity` (marca `is_received`), `cron-check-overdue-tests` (varredura), `notify-manager` | `/pendencias`, `/` | Controla ensaios ainda não recebidos até o fechamento do lote. |
| `audit_log` | `approve_concreting()` (INSERT `approve`/`reject`), triggers de alteração sensível (`update`/`alert`) | `/aprovacoes`, `/concretagens/:id` (indireto) | Só leitura pelo gestor; INSERT apenas service role/triggers; nunca UPDATE/DELETE. |

---

## 2. Function/Endpoint → Tabelas → Páginas (caminho inverso)

| Function/Endpoint | Tabelas que toca | Página(s) que chama | Observação |
|---|---|---|---|
| `extract-invoice-ocr` (Edge) | `truck_receipts` (UPDATE) | `/recebimento/:concretingId` | Chama Gemini 2.5 Pro na foto da NF; preenche `invoice_number`, atualiza `ocr_status`. |
| `extract-test-report` (Edge) | `test_reports` (UPDATE), `strength_results` (INSERT) | `/laudos` | Lê PDF do laudo (Gemini 2.5 Pro): extrai NF, idade (7/28) e fck medido; chama `match-report-to-concreting`. |
| `match-report-to-concreting` (Edge) | `test_reports` (UPDATE `matched_truck_receipt_id`), `truck_receipts` (leitura por `invoice_number`) | `/laudos` (indireto, via `extract-test-report`) | Marca `needs_review` se não houver match único por NF. |
| `evaluate-conformity` (Edge) | `strength_results` (leitura), `pieces` (leitura `fck_required`), `nonconformity_alerts` (INSERT), `pending_tests` (UPDATE `is_received`) | `/laudos`, `/alertas` (indireto) | Compara `measured_fck` × `required_fck`; se menor cria alerta e notifica gestor. |
| `sync-offline-batch` (Edge) | `concretings` (upsert), `truck_receipts` (upsert), `placement_records` (upsert), `placement_photos` (INSERT) | `/concretagens/nova`, `/recebimento/:concretingId`, `/lancamento/:concretingId` | Upsert idempotente por `client_local_id`; dispara OCR pendente ao reconectar. |
| `generate-conformity-report` (Edge) | `strength_results` (leitura), `concretings` (leitura), `sites` (escopo) | `/relatorios` | Usa Claude Haiku 4.5 para texto de conformidade/tendência em linguagem natural. |
| `export-spreadsheet` (Edge) | `concretings`, `truck_receipts`, `placement_records`, `pieces` (leitura) | `/relatorios` | Exporta/espelha o Excel atual em planilha estruturada. |
| `notify-manager` (Edge) | `profiles` (destinatário), `concretings`/`nonconformity_alerts`/`pending_tests` (contexto) | — (acionada por outras functions/cron, sem UI) | Envia email via Resend: aprovação pendente, NC ou ensaio em atraso. |
| `approve_concreting(concreting_id)` (RPC) | `concretings` (UPDATE `status`/`approved_by`/`approved_at`), `truck_receipts` (validação de completude), `audit_log` (INSERT) | `/aprovacoes` | Valida FCK/NF/caminhão/slump antes de aprovar; loga auditoria. |
| `handle_new_user()` (trigger) | `profiles` (INSERT) | `/login` (indireto, pós-signup) | Cria `profiles` automaticamente após signup no Supabase Auth. |
| `create_pending_tests()` (trigger em `truck_receipts`) | `truck_receipts` (AFTER INSERT), `pending_tests` (INSERT) | `/recebimento/:concretingId` (indireto) | Gera pendências de 7 e 28 dias com `due_date` ao criar recebimento. |
| `set_conformity_flag()` (trigger em `strength_results`) | `strength_results` (calcula `is_conforming`) | `/laudos` (indireto) | Calcula flag e aciona `evaluate-conformity`. |
| `cron-check-overdue-tests` (Cron pg_cron, diário) | `pending_tests` (varredura vencidas/não recebidas) | — (job agendado, sem UI) | Notifica gestor sobre ensaios de 7/28 dias em atraso via `notify-manager`. |

---

> **Checagem de órfãos:** todas as 14 tabelas da ESTRUTURA aparecem na Tabela 1; todas as Edge Functions (8), RPCs/triggers (4) e o cron (1) aparecem na Tabela 2. Nenhuma página do frontend referencia tabela ou function inexistente, e nenhuma tabela fica sem escrita/leitura mapeada.
