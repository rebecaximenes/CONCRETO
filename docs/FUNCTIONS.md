# FUNCTIONS — RastreConcreto

> **Backend:** Supabase (PostgreSQL + RLS + Auth + Storage + Edge Functions Deno + Realtime + Cron via pg_cron).
>
> Este documento cataloga TODAS as functions/endpoints do RastreConcreto. Os nomes seguem exatamente a `docs/ESTRUTURA.md`. Convenções de autenticação usadas abaixo:
> - **Usuário logado (JWT):** requer sessão Supabase Auth válida; RLS aplica-se ao papel efetivo (`site_members.site_role`).
> - **Gestor:** exige `role = 'production_manager'` na obra (helper `is_production_manager(site_id)`).
> - **Service role (interna):** invocada por outra Edge Function/trigger com a `service_role` key — nunca exposta ao frontend.
>
> Toda Edge Function valida o vínculo do usuário com a obra via `is_site_member(site_id)` antes de gravar. Chaves de IA/Resend ficam em Supabase Secrets, nunca no cliente.

---

## Edge Functions

### `extract-invoice-ocr`
- **Propósito:** ler a foto da nota fiscal do concreto e extrair automaticamente o número da NF para preencher o recebimento (elimina a digitação manual do Excel).
- **Input (body):**
  ```json
  {
    "truck_receipt_id": "uuid",
    "invoice_photo_path": "invoice-photos/site-x/receipt-y.jpg"
  }
  ```
- **Output:**
  ```json
  {
    "truck_receipt_id": "uuid",
    "invoice_number": "123456",
    "ocr_status": "done",
    "confidence": 0.94
  }
  ```
- **Regras de negócio/validações:**
  - Gera URL assinada do bucket privado `invoice-photos` e envia a imagem à **Gemini 2.5 Pro** (visão multimodal).
  - Atualiza `truck_receipts.ocr_status`: `processing` no início, `done` ao extrair, `failed` em erro.
  - Grava `truck_receipts.invoice_number` com o valor extraído; se a confiança for baixa ou nada for detectado, mantém `invoice_number` nulo e deixa `ocr_status = 'failed'` para preenchimento manual.
  - Não sobrescreve `invoice_number` já confirmado manualmente pelo técnico.
- **Autenticação:** usuário logado membro da obra dona do recebimento (grava via service role internamente após validação).

---

### `extract-test-report`
- **Propósito:** ler o laudo de ensaio em PDF, extrair número da NF, idade (7/28 dias) e fck medido, e gravar os resultados de resistência preenchendo a "planilha" automaticamente.
- **Input (body):**
  ```json
  {
    "test_report_id": "uuid",
    "storage_path": "test-reports/site-x/laudo-y.pdf"
  }
  ```
- **Output:**
  ```json
  {
    "test_report_id": "uuid",
    "invoice_number": "123456",
    "extraction_status": "done",
    "results": [
      { "age_days": 7,  "measured_fck": 22.5, "test_date": "2026-06-10" },
      { "age_days": 28, "measured_fck": 31.0, "test_date": "2026-07-01" }
    ]
  }
  ```
- **Regras de negócio/validações:**
  - Envia o PDF completo à **Gemini 2.5 Pro** (contexto longo) para extração estruturada.
  - Grava payload bruto em `test_reports.raw_extraction` (jsonb) para auditoria.
  - Atualiza `extraction_status`: `processing` → `done` (extração completa) / `needs_review` (dados ambíguos ou sem NF) / `failed`.
  - Para cada resultado válido, insere em `strength_results` (`age_days`, `measured_fck`, `test_date`), copiando `required_fck` da peça/traço vinculado (snapshot).
  - Chama `match-report-to-concreting` para resolver o vínculo pela NF antes de gravar `truck_receipt_id`/`piece_id` nos resultados.
  - Somente marca `age_days` como `7` ou `28`; outros marcos são ignorados (fora do escopo).
- **Autenticação:** gestor de produção da obra (upload do laudo). Gravações via service role.

---

### `match-report-to-concreting`
- **Propósito:** localizar o `truck_receipt` correspondente a um laudo pelo número da nota fiscal e vincular laudo/resultados à concretagem e peça.
- **Input (body):**
  ```json
  {
    "test_report_id": "uuid",
    "invoice_number": "123456",
    "site_id": "uuid"
  }
  ```
- **Output:**
  ```json
  {
    "matched_truck_receipt_id": "uuid | null",
    "matched_piece_id": "uuid | null",
    "match_type": "unique | none | ambiguous"
  }
  ```
- **Regras de negócio/validações:**
  - Busca em `truck_receipts` da obra (`site_id`) onde `invoice_number` bate com o extraído.
  - **Match único:** grava `test_reports.matched_truck_receipt_id` e propaga `truck_receipt_id`/`piece_id` para os `strength_results`; mantém `extraction_status = 'done'`.
  - **Nenhum match ou ambíguo (>1 recebimento):** marca `test_reports.extraction_status = 'needs_review'` para o gestor resolver manualmente na tela `/laudos`.
  - Chave de vínculo é sempre o `invoice_number` (regra de negócio confirmada no PROCESSO).
- **Autenticação:** service role (chamada interna por `extract-test-report`).

---

### `evaluate-conformity`
- **Propósito:** comparar o fck medido com o fck exigido e gerar alerta de não conformidade quando a resistência fica abaixo do exigido.
- **Input (body):**
  ```json
  {
    "strength_result_id": "uuid"
  }
  ```
- **Output:**
  ```json
  {
    "strength_result_id": "uuid",
    "is_conforming": false,
    "alert_created": true,
    "nonconformity_alert_id": "uuid | null"
  }
  ```
- **Regras de negócio/validações:**
  - Lê o `strength_results`; se `measured_fck < required_fck`, cria `nonconformity_alert` (`severity = 'high'`, `status = 'open'`) com snapshot de `age_days`, `measured_fck`, `required_fck` e `truck_receipt_id`.
  - **Aplica tanto aos 7 quanto aos 28 dias** (SUPOSIÇÃO confirmada: resultado de 7 dias abaixo do fck também alerta).
  - Marca o `pending_tests` correspondente (`truck_receipt_id` + `age_days`) como `is_received = true` / `received_at = now()`.
  - Dispara `notify-manager` para o alerta de não conformidade.
  - Registra a ação em `audit_log` (`action = 'alert'`).
- **Autenticação:** service role (chamada após extração ou pelo trigger `set_conformity_flag`).

---

### `sync-offline-batch`
- **Propósito:** receber e persistir de forma idempotente o lote de registros criados offline no dispositivo quando a conexão retorna.
- **Input (body):**
  ```json
  {
    "concretings":   [ { "client_local_id": "...", "site_id": "...", "...": "..." } ],
    "truck_receipts":[ { "client_local_id": "...", "concreting_local_id": "...", "...": "..." } ],
    "placement_records":[ { "client_local_id": "...", "...": "..." } ]
  }
  ```
- **Output:**
  ```json
  {
    "synced": { "concretings": 2, "truck_receipts": 3, "placement_records": 5 },
    "id_map": { "local_id": "server_uuid" },
    "conflicts": []
  }
  ```
- **Regras de negócio/validações:**
  - **Upsert idempotente** por `client_local_id` respeitando os índices UNIQUE (`uniq_concretings_client_local`, `uniq_truck_receipts_client_local`, `uniq_placement_client_local`) — reenvios não duplicam registros.
  - Resolve dependências offline: mapeia `client_local_id` de concretagem para o `uuid` do servidor antes de inserir recebimentos/lançamentos filhos.
  - Preenche `synced_at = now()` em cada registro sincronizado.
  - Dispara `extract-invoice-ocr` para recebimentos com foto de NF cujo `ocr_status = 'pending'`.
  - Valida que o usuário é membro da obra de cada registro; rejeita e devolve em `conflicts` os itens de obras sem acesso.
  - Garante a regra de completude mínima (FCK, NF, caminhão, slump) apenas na aprovação, não no sync (sync não bloqueia campos pendentes).
- **Autenticação:** usuário logado (o `received_by`/`recorded_by`/`created_by` deve ser o próprio usuário autenticado).

---

### `generate-conformity-report`
- **Propósito:** gerar relatório de conformidade e análise de tendência de qualidade em linguagem natural a partir do histórico de ensaios e concretagens.
- **Input (body):**
  ```json
  {
    "site_id": "uuid",
    "period_start": "2026-01-01",
    "period_end": "2026-06-30",
    "depth": "standard | deep"
  }
  ```
- **Output:**
  ```json
  {
    "report_text": "Resumo em linguagem natural...",
    "metrics": {
      "total_concretings": 42,
      "conformity_rate": 0.95,
      "nonconformities": 2,
      "trend": "estável"
    }
  }
  ```
- **Regras de negócio/validações:**
  - Agrega `strength_results`, `concretings` e `nonconformity_alerts` do período/obra.
  - Calcula taxa de conformidade (`is_conforming`), contagem de não conformidades e tendência do fck ao longo do tempo.
  - Gera o texto com **Claude Haiku 4.5** (rápido/barato) por padrão; escala para **Claude Sonnet 4.6** quando `depth = "deep"` (relatório analítico mais profundo).
  - Restringe os dados estritamente à obra do gestor solicitante.
- **Autenticação:** gestor de produção da obra.

---

### `export-spreadsheet`
- **Propósito:** exportar os dados estruturados das concretagens em planilha, espelhando/substituindo o Excel atual.
- **Input (body):**
  ```json
  {
    "site_id": "uuid",
    "concreting_ids": ["uuid"],
    "period_start": "2026-01-01",
    "period_end": "2026-06-30",
    "format": "xlsx"
  }
  ```
- **Output:** URL assinada (temporária) do arquivo gerado no Storage, ou o binário da planilha.
  ```json
  { "download_url": "https://...signed", "expires_in": 3600 }
  ```
- **Regras de negócio/validações:**
  - Monta linhas com FCK do traço, NF, caminhão, slump, temperatura (peças especiais), responsável técnico, peças concretadas e resultados de 7/28 dias — todo o ciclo rastreável.
  - Filtra por `concreting_ids` explícitos ou por período; sempre limitado à obra.
  - Gera arquivo em bucket privado e devolve URL assinada com expiração.
- **Autenticação:** gestor de produção da obra.

---

### `notify-manager`
- **Propósito:** enviar notificação/email ao gestor de produção sobre eventos que exigem sua atenção.
- **Input (body):**
  ```json
  {
    "site_id": "uuid",
    "event_type": "pending_approval | nonconformity | overdue_test",
    "entity_id": "uuid",
    "context": { "...": "..." }
  }
  ```
- **Output:**
  ```json
  { "sent": true, "channel": "email", "message_id": "resend-id" }
  ```
- **Regras de negócio/validações:**
  - Resolve os gestores da obra (`site_members.site_role = 'production_manager'` / `profiles.role`).
  - Envia email via **Resend** (Free tier, 100/dia) com conteúdo por `event_type`:
    - `pending_approval` — nova concretagem aguardando aprovação;
    - `nonconformity` — fck medido abaixo do exigido;
    - `overdue_test` — ensaio de 7/28 dias em atraso.
  - Só notifica gestores ativos (`is_active = true`).
- **Autenticação:** service role (chamada por outras Edge Functions, triggers e cron).

---

## Postgres Functions (RPC/triggers)

### `approve_concreting(concreting_id uuid)`
- **Tipo:** RPC chamável pelo client (via `supabase.rpc`).
- **Propósito:** validar a completude do recebimento e aprovar formalmente uma concretagem.
- **Input:** `concreting_id uuid`.
- **Output:** registro atualizado de `concretings` (ou erro de validação).
- **Regras que aplica:**
  - Exige que o chamador seja gestor de produção da obra (`is_production_manager(site_id)`).
  - Valida completude de **todos os recebimentos** vinculados: `fck_required`, `invoice_number`, `truck_number` e `slump_value` preenchidos; para recebimentos de peça especial, exige `temperature`.
  - Bloqueia aprovação se houver campos obrigatórios faltando (recebimento incompleto).
  - Ao aprovar: `status = 'approved'`, `approved_by = auth.uid()`, `approved_at = now()`; ou `status = 'rejected'` quando aplicável.
  - Grava a ação em `audit_log` (`action = 'approve'` / `'reject'`).
- **Quando dispara:** chamada HTTP via RPC pela tela `/aprovacoes`.

---

### `handle_new_user()`
- **Tipo:** trigger de tabela (`SECURITY DEFINER`).
- **Propósito:** criar automaticamente o registro em `profiles` quando um usuário se cadastra no Supabase Auth.
- **Input/Output:** implícito (NEW row de `auth.users`); sem retorno ao client.
- **Regras que aplica:**
  - Insere em `profiles` com `id`, `email`, `full_name` (dos metadados do signup) e `role = 'field_tech'` (default), `is_active = true`.
- **Quando dispara:** `AFTER INSERT ON auth.users`.

---

### `create_pending_tests()`
- **Tipo:** trigger de tabela.
- **Propósito:** gerar automaticamente as pendências de ensaio de 7 e 28 dias sempre que um recebimento é criado.
- **Input/Output:** NEW row de `truck_receipts`; sem retorno ao client.
- **Regras que aplica:**
  - Insere duas linhas em `pending_tests` para o `truck_receipt_id`: uma com `age_days = 7` e `due_date = data_do_recebimento + 7`, outra com `age_days = 28` e `due_date = data_do_recebimento + 28`.
  - `is_received = false` por padrão até a chegada do laudo.
- **Quando dispara:** `AFTER INSERT ON truck_receipts`.

---

### `set_conformity_flag()`
- **Tipo:** trigger de tabela.
- **Propósito:** calcular o flag de conformidade de um resultado de resistência e acionar a avaliação de não conformidade.
- **Input/Output:** NEW row de `strength_results`; sem retorno ao client.
- **Regras que aplica:**
  - Define `is_conforming = (measured_fck >= required_fck)`.
  - Aciona a Edge Function `evaluate-conformity` (via `pg_net`/queue) para o resultado inserido — responsável por criar `nonconformity_alert` quando não conforme e por marcar `pending_tests` como recebido.
  - Aplica-se aos dois marcos (`age_days` 7 e 28).
- **Quando dispara:** `BEFORE INSERT OR UPDATE ON strength_results` (cálculo do flag) + `AFTER INSERT` (acionamento da avaliação).

---

### `cron-check-overdue-tests`
- **Tipo:** função de cron (pg_cron).
- **Propósito:** identificar ensaios de 7/28 dias vencidos e ainda não recebidos e notificar o gestor.
- **Input/Output:** sem input; efeito colateral de notificação.
- **Regras que aplica:**
  - Varre `pending_tests` onde `is_received = false` e `due_date < current_date` (usa o índice parcial `idx_pending_tests_open`).
  - Para cada pendência vencida, dispara `notify-manager` com `event_type = 'overdue_test'` referenciando o `truck_receipt_id`.
  - Evita notificações duplicadas do mesmo item no mesmo ciclo.
- **Quando dispara:** agendamento **pg_cron diário** (ex.: uma execução por dia pela manhã).

---

### Funções helper de RLS (SECURITY DEFINER)

Usadas pelas políticas de Row Level Security; não chamadas diretamente pelo frontend como fluxo de negócio, mas documentadas por completude.

- **`is_site_member(site_id uuid) → boolean`** — retorna `true` se `auth.uid()` possui vínculo ativo em `site_members` para a obra. Base de quase todas as políticas de SELECT/INSERT.
- **`is_production_manager(site_id uuid) → boolean`** — retorna `true` se o usuário é gestor de produção naquela obra; usado nas políticas de aprovação, cadastro de traços/peças e revisão de laudos.
- **`current_profile_role() → text`** — retorna o `role` do `profiles` do usuário logado; auxilia decisões de UI e políticas globais.

---

> **Nota de extensão do Agente de Documentação:** nenhuma function nova foi adicionada além das listadas na ESTRUTURA. As funções helper de RLS (`is_site_member`, `is_production_manager`, `current_profile_role`) já constavam na seção 2 da ESTRUTURA e foram apenas formalizadas aqui como Postgres functions. O acionamento de `evaluate-conformity` a partir de `set_conformity_flag` (via `pg_net`) é a materialização explícita da regra "após a extração (ou via trigger)" descrita na ESTRUTURA.
