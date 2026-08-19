# PRS — RastreConcreto (Product/System Requirements Specification)

> Plataforma de controle e rastreabilidade do ciclo de vida do concreto em obra, criada para substituir a planilha de Excel que "demanda muito tempo para alimentar". Backend **Supabase** (não negociável); frontend construído no **Lovable** (caminho definido na ESTRUTURA).

---

## 1. Requisitos de sistema

Cada RS é técnico e testável, e rastreia o requisito funcional (RF) inferido do PROCESSO/ESTRUTURA. Convenção de RFs desta ideia:

- **RF-01** Autenticação e papéis (recebimento, laje, gestor) por obra
- **RF-02** Iniciar/gerenciar concretagem (evento do dia)
- **RF-03** Registro de recebimento do caminhão (NF, caminhão, slump, fck, temperatura de peça especial)
- **RF-04** OCR da foto da nota fiscal → preenche número da NF
- **RF-05** Registro de lançamento na laje (peça + responsável técnico + fotos)
- **RF-06** Funcionamento offline com sincronização posterior
- **RF-07** Aprovação da concretagem pelo gestor
- **RF-08** Upload de laudo em PDF e extração automática por IA (NF, idade, fck medido)
- **RF-09** Vínculo laudo↔concretagem pela nota fiscal
- **RF-10** Alerta de não conformidade quando fck medido < fck exigido (7 e 28 dias)
- **RF-11** Controle de pendências de ensaio (7/28 dias) e cobrança de atrasos
- **RF-12** Relatórios de conformidade e tendências em linguagem natural + exportação de planilha
- **RF-13** Notificações ao gestor (aprovação pendente, não conformidade, ensaio em atraso)
- **RF-14** Armazenamento e vínculo de fotos/documentos

### Requisitos

**RS-01:** O login deve aceitar email/senha e magic link via Supabase Auth; toda requisição autenticada sem `profile` ativo (`is_active = true`) deve ser rejeitada.
Rastreia: RF-01

**RS-02:** O papel efetivo do usuário deve ser resolvido por `site_members.site_role` na obra corrente; um usuário sem vínculo em `site_members` para a `site_id` acessada deve receber 403 nas políticas RLS.
Rastreia: RF-01

**RS-03:** O endpoint/insert de `concretings` deve exigir `site_id` válido e criar registro com `status = 'in_progress'` e `created_by = auth.uid()`; concretagem só pode ser editada pelo criador enquanto `in_progress`.
Rastreia: RF-02

**RS-04:** O insert de `truck_receipts` deve rejeitar registros sem `invoice_number`, `truck_number`, `slump_value` e `fck_required` (recebimento incompleto), retornando erro de validação.
Rastreia: RF-03

**RS-05:** O campo `temperature` deve ser obrigatório somente quando `is_special_piece = true`; para `is_special_piece = false` o campo é opcional e não bloqueia o salvamento.
Rastreia: RF-03

**RS-06:** A Edge Function `extract-invoice-ocr` deve receber `invoice_photo_path`, extrair o número da NF via IA de visão, gravar em `truck_receipts.invoice_number` e atualizar `ocr_status` para `done` (ou `failed` em erro), sem nunca expor a API key da IA ao frontend.
Rastreia: RF-04

**RS-07:** O insert de `placement_records` deve exigir `piece_id` e `responsible_tech_id` não nulos; lançamento sem peça ou sem responsável técnico deve ser rejeitado.
Rastreia: RF-05

**RS-08:** Cada `placement_photos` deve referenciar um `placement_record_id` existente e um `storage_path` no bucket privado `placement-photos`; a leitura deve ocorrer apenas via URL assinada gerada server-side.
Rastreia: RF-05, RF-14

**RS-09:** Todos os registros criados offline devem carregar um `client_local_id`; a Edge Function `sync-offline-batch` deve fazer upsert idempotente por `client_local_id` (constraints UNIQUE `(created_by/received_by/recorded_by, client_local_id)`), garantindo que reenvios não dupliquem dados.
Rastreia: RF-06

**RS-10:** A sincronização deve preencher `synced_at` no momento do upsert e disparar OCR pendente para recebimentos cuja foto ainda não foi processada (`ocr_status = 'pending'`).
Rastreia: RF-06, RF-04

**RS-11:** O RPC `approve_concreting(concreting_id)` deve validar a completude do recebimento (fck, NF, caminhão, slump) antes de gravar `status = 'approved'`, `approved_by` e `approved_at`; deve rejeitar aprovação se algum recebimento estiver incompleto e registrar a ação em `audit_log`.
Rastreia: RF-07

**RS-12:** Apenas usuários com papel `production_manager` na obra devem poder mudar `concretings.status` para `approved`/`rejected` (garantido por RLS + RPC SECURITY DEFINER).
Rastreia: RF-07, RF-01

**RS-13:** A Edge Function `extract-test-report` deve ler o PDF de `test_reports.storage_path`, extrair `invoice_number`, `age_days` (7 ou 28) e `measured_fck`, gravar `strength_results` e definir `extraction_status` em `done` ou `needs_review` (quando dados incompletos/ambíguos).
Rastreia: RF-08

**RS-14:** A Edge Function `match-report-to-concreting` deve resolver `matched_truck_receipt_id` pelo `invoice_number`; se não houver match único, deve marcar `extraction_status = 'needs_review'` sem criar vínculo incorreto.
Rastreia: RF-09

**RS-15:** O trigger `set_conformity_flag()` deve calcular `is_conforming = (measured_fck >= required_fck)` em todo insert de `strength_results` e acionar `evaluate-conformity`.
Rastreia: RF-10

**RS-16:** A Edge Function `evaluate-conformity` deve criar um `nonconformity_alerts` (`status = 'open'`) sempre que `measured_fck < required_fck`, tanto para `age_days = 7` quanto `age_days = 28`, e disparar notificação ao gestor.
Rastreia: RF-10, RF-13

**RS-17:** O trigger `create_pending_tests()` deve gerar, a cada `truck_receipts` criado, duas pendências em `pending_tests` (`age_days` 7 e 28) com `due_date` calculada a partir de `created_at`.
Rastreia: RF-11

**RS-18:** O cron `cron-check-overdue-tests` deve rodar diariamente, selecionar `pending_tests` com `is_received = false` e `due_date < current_date` e notificar o gestor sobre ensaios em atraso.
Rastreia: RF-11, RF-13

**RS-19:** A Edge Function `generate-conformity-report` deve produzir relatório de conformidade e análise de tendência em linguagem natural a partir de `strength_results`/`concretings` da obra, restrito às obras das quais o solicitante é membro.
Rastreia: RF-12

**RS-20:** A Edge Function `export-spreadsheet` deve exportar os dados estruturados das concretagens selecionadas em planilha (espelhando o Excel atual), retornando arquivo via URL assinada.
Rastreia: RF-12

**RS-21:** A Edge Function `notify-manager` deve enviar email via Resend nos eventos: concretagem aguardando aprovação, alerta de não conformidade e ensaio em atraso; nunca deve expor a API key da Resend ao cliente.
Rastreia: RF-13

**RS-22:** Toda ação de `approve`/`reject`/`update`/`alert` em entidades sensíveis deve gerar linha em `audit_log` com `actor_id`, `entity`, `entity_id` e `details`; `audit_log` não pode ser atualizado nem deletado por nenhum papel.
Rastreia: RF-07, RF-10

---

## 2. Arquitetura

Sistema em três camadas: **frontend PWA (Lovable/React)** → **backend Supabase** → **integrações externas via Edge Functions**.

```
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND — Lovable (React + Tailwind + shadcn/ui, PWA)       │
│  Campo (celular/tablet): /recebimento, /lancamento           │
│    → captura foto NF/peça, salva OFFLINE (IndexedDB)          │
│  Escritório (gestor): /aprovacoes, /laudos, /alertas,        │
│    /pendencias, /relatorios, /dashboard                      │
└───────────────┬──────────────────────────────────────────────┘
                │ Supabase JS SDK (Auth + REST + Realtime + Storage)
                │ + fila offline → sync-offline-batch
                ▼
┌──────────────────────────────────────────────────────────────┐
│  BACKEND — Supabase                                           │
│  Auth (email/senha + magic link)  ── profiles ── site_members│
│  PostgreSQL + RLS  (concretings, truck_receipts, pieces,     │
│    placement_records, test_reports, strength_results,        │
│    nonconformity_alerts, pending_tests, audit_log)           │
│  Storage privado (invoice-photos, placement-photos,          │
│    test-reports)  → URLs assinadas                           │
│  Triggers/RPC: handle_new_user, create_pending_tests,        │
│    set_conformity_flag, approve_concreting                   │
│  Realtime: alertas e aprovações em tempo real               │
│  Cron (pg_cron): cron-check-overdue-tests (diário)          │
│  Edge Functions (Deno):                                      │
│    extract-invoice-ocr · extract-test-report ·              │
│    match-report-to-concreting · evaluate-conformity ·       │
│    sync-offline-batch · generate-conformity-report ·        │
│    export-spreadsheet · notify-manager                      │
└───────┬───────────────────┬───────────────────┬─────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐  ┌────────────────┐  ┌─────────────────┐
│ Gemini 2.5 Pro│  │ Claude Haiku4.5│  │  Resend (email) │
│ OCR NF + PDF  │  │ relatórios NL  │  │  notif. gestor  │
│ laudo (visão) │  │ + tendências   │  │                 │
└───────────────┘  └────────────────┘  └─────────────────┘
```

Fluxo central: recebimento em campo (foto NF → OCR) e lançamento na laje são criados **offline** e sincronizados; o gestor aprova; ao chegar o laudo em PDF, a IA extrai NF/idade/fck, vincula pela **nota fiscal**, avalia conformidade e alerta quando `measured_fck < required_fck`.

---

## 3. Stack tecnológica

**Backend — Supabase (não negociável):**
- **PostgreSQL + RLS:** modelo relacional descrito na ESTRUTURA (concretagens, recebimentos, lançamentos, laudos, resultados, alertas, pendências, auditoria), com RLS por obra.
- **Auth:** email/senha (equipe de campo com login simples) + magic link (gestor no escritório sem gerenciar senha). Sem OAuth neste momento — não há cliente externo.
- **Storage:** buckets privados para fotos de NF, fotos de lançamento e PDFs de laudo, acessados por URL assinada.
- **Edge Functions (Deno):** toda a inteligência e integrações externas (OCR de NF, extração de laudo, avaliação de conformidade, sync offline, relatórios, export, notificações).
- **Realtime:** empurrar alertas de não conformidade e itens da fila de aprovação ao gestor.
- **Cron (pg_cron):** varredura diária de ensaios em atraso (7/28 dias).

**Frontend — Lovable + Supabase (caminho da ESTRUTURA):**
A equipe descrita é composta por **técnicos de edificações** e **gestor de produção** — nenhum time de TI ou capacidade de codar foi mencionada, e o objetivo declarado é sair rápido da planilha de Excel que "demanda muito tempo para alimentar". Por isso o caminho é **Lovable**: no-code assistido por IA que gera **React + Tailwind + shadcn/ui** com integração nativa ao Supabase, suporta **captura de foto** pelo celular/tablet, permite montar um **PWA com funcionamento offline e sincronização posterior** (exigência direta da obra com internet instável) e faz deploy com preview. A lógica pesada fica em Edge Functions, idênticas em qualquer caminho — então não há amarra de vendor no lado da inteligência.

**IA e integrações:**
- **Gemini 2.5 Pro (Google)** — OCR da foto da nota fiscal e leitura do laudo em PDF (multimodal nativo, contexto longo para PDFs completos, custo baixo). Motor do preenchimento automático que substitui a digitação no Excel.
- **Claude Haiku 4.5 (Anthropic)** — geração dos relatórios de conformidade em linguagem natural e resumos de tendência (rápido e barato para o volume de uma equipe de obra); escalar pontualmente a **Claude Sonnet 4.6** para análises mais profundas sob demanda.
- **Resend (email)** — notificações ao gestor; Free tier (100/dia) atende o volume descrito.

**Custos estimados:** Lovable Pro R$95/mês + Supabase Pro R$125/mês (recomendado por causa de Storage de PDFs/fotos e Edge Functions) + uso de IA na casa de poucos dólares/mês (baixo número de documentos por concretagem) + Resend Free.

---

## 4. Segurança

**Autenticação:** Supabase Auth com email/senha (principal) e magic link (gestor). Trigger `handle_new_user()` cria `profiles` no signup. Papel efetivo por obra vem de `site_members.site_role`, avaliado por funções helper `SECURITY DEFINER` (`is_site_member`, `is_production_manager`, `current_profile_role`).

**RLS por tabela (resumo aplicado):**
- `profiles`: SELECT próprio + gestores da mesma obra; UPDATE próprio (dados básicos) e gestor (`role`/`is_active`); sem DELETE.
- `sites` / `site_members`: SELECT membros; INSERT/UPDATE/DELETE somente gestor de produção da obra.
- `concrete_mixes` / `pieces`: SELECT membros; escrita somente gestor.
- `concretings`: SELECT membros; INSERT técnicos membros; UPDATE criador enquanto `in_progress` + gestor (aprovação); DELETE gestor.
- `truck_receipts`: SELECT membros; INSERT técnicos; UPDATE pelo `received_by` até aprovação e por Edge Function (OCR, service role); DELETE gestor.
- `placement_records` / `placement_photos`: SELECT membros; INSERT técnicos; UPDATE pelo `recorded_by` até aprovação; DELETE `recorded_by` (até aprovação) ou gestor.
- `test_reports` / `strength_results`: SELECT membros; INSERT gestor (upload) + Edge Function (extração); UPDATE Edge Function e gestor (revisão de `needs_review`).
- `nonconformity_alerts`: SELECT membros; INSERT apenas Edge Function/trigger (service role); UPDATE gestor (acknowledge/resolve); sem DELETE.
- `pending_tests`: SELECT membros; INSERT/UPDATE Edge Function/cron; DELETE gestor.
- `audit_log`: SELECT gestor; INSERT service role/triggers; **sem UPDATE nem DELETE** (imutável).

**Storage:** buckets `invoice-photos`, `placement-photos`, `test-reports` **privados**; políticas restringem acesso a membros da obra dona do registro; leitura sempre via **URL assinada** gerada server-side (nunca URL pública).

**Dados sensíveis / LGPD:** os dados pessoais tratados são de profissionais (nome, email, telefone) — não há dados de clientes externos neste momento. Desativação por `is_active` (soft delete) preserva a trilha de rastreabilidade e auditoria. Fotos e laudos ficam em buckets privados. A trilha `audit_log` registra quem aprovou/alterou o quê. Coleta limitada ao necessário para a rastreabilidade da concretagem (minimização).

**Segredos e API keys:** chaves de Gemini, Anthropic e Resend ficam exclusivamente em **secrets do Supabase**, usadas apenas dentro das Edge Functions. **Nunca** trafegam pelo frontend nem ficam hardcoded. O frontend só usa a `anon key` protegida por RLS; a `service_role key` é usada somente server-side (sync, OCR, extração, alertas).

---

## 5. Performance

**Carga/volume esperado (ancorado nas respostas):** uma equipe de obra — poucos técnicos de campo + gestor de produção. Volume típico: algumas concretagens por dia, cada uma com um punhado de recebimentos de caminhão e lançamentos por peça, e um número pequeno de laudos em PDF por concretagem (marcos de 7 e 28 dias). É um volume operacional baixo/moderado, bem servido por Supabase Pro.

**Índices críticos (já previstos na ESTRUTURA):**
- `idx_truck_receipts_invoice (invoice_number)` e `idx_test_reports_invoice (invoice_number)` — essenciais para o vínculo laudo↔recebimento pela **nota fiscal**.
- `idx_concretings_status`, `idx_concretings_date desc` — fila de aprovação e listagens por período.
- `idx_pending_tests_open (is_received) WHERE is_received = false` — índice parcial que acelera o cron de ensaios em atraso.
- `idx_strength_results_conforming`, `idx_strength_results_age` — relatórios de conformidade/tendência.
- Constraints UNIQUE por `client_local_id` — deduplicação idempotente da sincronização offline.

**Offline e sincronização:** registros de campo são gravados localmente (IndexedDB) e enviados em lote via `sync-offline-batch` com upsert idempotente por `client_local_id`, evitando duplicidade em reenvios após reconexão.

**Limites conhecidos e mitigação:**
- **Timeout de Edge Function (~60s):** processar **um** PDF/foto por invocação; se um laudo trouxer muitos corpos de prova, paginar/dividir a extração e usar `extraction_status = 'needs_review'` como fallback em vez de estourar o tempo.
- **Tamanho de payload:** fotos e PDFs vão direto ao **Storage**; as Edge Functions recebem apenas o `storage_path`, não o binário — mantém payloads pequenos.
- **Free tier do Supabase:** Storage de PDFs/fotos e o volume de Edge Function invocations justificam operar no **Pro (R$125/mês)** assim que o volume de fotos/laudos crescer.
- **Custo de IA:** OCR/laudos e relatórios ficam na casa de poucos dólares/mês dado o baixo número de documentos por concretagem; monitorar caso o número de obras/concretagens escale.
