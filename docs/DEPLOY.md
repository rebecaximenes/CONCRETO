# Implantação — RastreConcreto

Roteiro para tirar a plataforma do repositório e colocar em produção. A ordem
importa: banco → segredos → Edge Functions → cron → primeira obra.

Projeto Supabase em uso hoje (criado pelo Lovable):
`jozoilvewsptyxaodrxl` — https://jozoilvewsptyxaodrxl.supabase.co

---

## 1. Banco (já aplicado no projeto atual)

No SQL Editor do Supabase, nesta ordem. Em um projeto novo, rode tudo; no
projeto atual, só o que ainda faltar:

1. `db/schemas.sql` — 14 tabelas, RLS, policies e helpers
2. `supabase/migrations/20260819000200_handle_new_user.sql` — profile no signup
3. `supabase/migrations/20260819000300_storage_buckets.sql` — buckets privados
4. `supabase/migrations/20260819000400_business_functions.sql` — aprovação, pendências, conformidade
5. `supabase/migrations/20260820000600_delivery_times.sql` — horários da entrega
6. `supabase/migrations/20260819000500_cron_overdue_tests.sql` — cron (ver passo 4)
7. `db/bootstrap.sql` — **uma vez**, para o primeiro gestor e a primeira obra

Confira ao final:

```sql
select
  (select count(*) from information_schema.tables where table_schema='public') as tabelas,   -- 14
  (select count(*) from pg_policies where schemaname='public') as policies,                  -- 47
  (select count(*) from storage.buckets
     where id in ('invoice-photos','placement-photos','test-reports')) as buckets;           -- 3
```

---

## 2. Segredos

Sem estas chaves a leitura por IA — o motivo de existir da plataforma — não
funciona. Em **Project Settings → Edge Functions → Secrets**, ou pela CLI:

```bash
supabase secrets set \
  GEMINI_API_KEY="..." \
  ANTHROPIC_API_KEY="..." \
  RESEND_API_KEY="..." \
  RESEND_FROM="RastreConcreto <naoresponda@seudominio.com.br>" \
  APP_URL="https://seu-app.exemplo.com.br"
```

| Segredo | Para quê | Obrigatório |
|---|---|---|
| `GEMINI_API_KEY` | OCR da nota fiscal e leitura do PDF do laudo | sim |
| `ANTHROPIC_API_KEY` | Texto do relatório de conformidade | só para `/relatorios` |
| `RESEND_API_KEY` | E-mail ao gestor | só para notificação |
| `RESEND_FROM` | Remetente verificado no Resend | opcional |
| `APP_URL` | Link dentro do e-mail | opcional |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já existem
automaticamente nas Edge Functions — não precisa cadastrar.

---

## 3. Edge Functions

```bash
supabase login
supabase link --project-ref jozoilvewsptyxaodrxl

supabase functions deploy extract-invoice-ocr
supabase functions deploy extract-test-report
supabase functions deploy match-report-to-concreting
supabase functions deploy evaluate-conformity
supabase functions deploy notify-manager
supabase functions deploy sync-offline-batch
supabase functions deploy generate-conformity-report
supabase functions deploy export-spreadsheet
```

Teste rápido do OCR depois de registrar um recebimento com foto:

```bash
supabase functions invoke extract-invoice-ocr \
  --body '{"truck_receipt_id":"<uuid do recebimento>"}'
```

Esperado: `ocr_status` vira `done` e `invoice_number` aparece preenchido. Se a
foto estiver ruim, volta `failed` e o campo fica para o técnico digitar — é o
comportamento correto, não um erro.

---

## 4. Cron de ensaios em atraso

O job precisa saber para onde chamar a `notify-manager`. Rode **uma vez**,
trocando os valores:

```sql
alter database postgres set app.edge_functions_url =
  'https://jozoilvewsptyxaodrxl.supabase.co/functions/v1';
alter database postgres set app.service_role_key = '<service role key>';
```

Depois aplique `supabase/migrations/20260819000500_cron_overdue_tests.sql`. Para
conferir o agendamento e forçar uma execução:

```sql
select jobname, schedule, active from cron.job;
select public.check_overdue_tests();   -- devolve quantas obras foram notificadas
```

Sem essas duas chaves o job ainda roda e registra o atraso em `audit_log` —
só não dispara o e-mail.

---

## 5. Frontend

```bash
npm install
cp .env.example .env     # VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run build
```

O `dist/` é estático: serve em qualquer hospedagem (Vercel, Netlify, Cloudflare
Pages, S3). Como é PWA, precisa de **HTTPS** para instalar no celular e para o
service worker funcionar offline.

---

## 6. Primeiro uso, na ordem que a obra vai usar

1. Gestor entra pelo `/login` e cadastra **traços** e **peças** da obra
   (marcando as peças especiais — são elas que exigem temperatura)
2. Gestor inclui a equipe em `/configuracoes` e define o papel de cada um
3. Técnico abre a **concretagem do dia** e registra o **recebimento** com a foto
   da NF — confira se o OCR preencheu o número
4. Técnico na laje registra o **lançamento**, escolhendo a peça e o caminhão
5. Criador envia para aprovação; **gestor aprova** em `/aprovacoes`
6. Quando o laudo chegar, gestor envia o PDF em `/laudos` — confira se os
   resultados de 7/28 dias apareceram e se o alerta abriu quando abaixo do fck
7. `/relatorios` gera o texto de conformidade e exporta a planilha

## 7. Teste do modo offline (fazer antes de liberar para a obra)

1. Abra o app no celular, entre e abra uma concretagem
2. **Ligue o modo avião**
3. Registre um recebimento com foto — deve salvar na hora e o cabeçalho passa a
   mostrar "1 pendente"
4. Feche o app completamente e abra de novo: o pendente continua lá
5. Desligue o modo avião — o registro sobe sozinho e o contador zera
