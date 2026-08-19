# SKILL.md — Guia Operacional de Construção do RastreConcreto

> Este documento ensina a IA de desenvolvimento (Lovable) COMO construir o **RastreConcreto** — a plataforma que substitui a planilha de Excel que "demanda muito tempo para alimentar", rastreando cada concretagem do recebimento do caminhão betoneira até os ensaios de resistência (fck) aos 7 e 28 dias, com leitura automática de nota fiscal e laudo de ensaio por IA.
>
> **Backend:** Supabase (PostgreSQL + RLS + Auth + Storage + Edge Functions Deno + Realtime + Cron via pg_cron) — não negociável.
> **Build do frontend:** Lovable + Supabase (React + Tailwind + shadcn/ui), como **PWA com captura de foto e funcionamento offline com sincronização posterior**.
>
> Regras aqui são específicas do RastreConcreto — não são conselhos genéricos. Elas mandam sobre qualquer suposição default.

---

## Convenções

**Nomenclatura de banco (PostgreSQL):**
- Tudo em **inglês, snake_case**. Tabelas no plural (`concretings`, `test_reports`, `site_members`, `profiles`). Colunas snake_case (`invoice_number`, `truck_number`, `slump_test`, `fck_target`, `poured_element`).
- Chaves primárias `id` (uuid). Timestamps `created_at` / `updated_at`. Chaves estrangeiras no padrão `<tabela_singular>_id` (ex: `site_id`, `concreting_id`, `profile_id`).
- **Nunca** invente nome de tabela ou coluna: os nomes canônicos estão em `db/schemas.sql` e cruzados em `docs/DEPARA.md`. Use exatamente esses.

**Nomenclatura de rotas e Edge Functions:**
- Rotas do frontend em **kebab-case** conforme `docs/PAGINAS.md` (ex: `/login`, e demais rotas listadas lá). Não crie rota que não exista no PAGINAS.
- Edge Functions com os nomes exatos de `docs/FUNCTIONS.md` (ex: `notify-manager`, e as funções de OCR/leitura de NF e laudo). RPCs em snake_case (`approve_concreting()`, `current_profile_role()`, `is_production_manager()`).

**Stack (fixa, não substituível):**
- Backend SEMPRE Supabase: PostgreSQL + RLS + Auth (email/OAuth/magic link) + Storage (fotos de etiqueta/NF, PDFs de laudo) + Edge Functions (OCR, cálculo de conformidade, notificações) + Realtime (acompanhamento da laje) + Cron/pg_cron (janelas de ensaio 7/28 dias).
- Frontend: React + Tailwind + shadcn/ui gerado no **Lovable**, empacotado como **PWA offline-first** — escolhido porque a operação é conduzida por técnicos de edificações no campo (celular/tablet) com internet instável e sem time de TI para manter a plataforma. Não troque por Next.js/Vue/Angular.
- Integrações externas SEMPRE via Edge Functions (leitura de PDF de laudo, OCR de nota fiscal). Automação recorrente via pg_cron. **Nunca** N8N nem Zapier.

**Papéis do domínio (de `docs/PROCESSO.md`):** técnico de **recebimento** (confere slump, nota fiscal, número do caminhão betoneira), técnico de **rastreabilidade na laje** (registra em que peças o concreto foi lançado), e **gestor de produção** (aprova por concretagem realizada). O papel efetivo vem sempre de `site_members.site_role` — por obra, não global.

---

## Ordem de implementação recomendada

Siga a ordem de dependência das 3 fases de `docs/PLANO.md`:

1. **Fundação (Fase 1) — banco + auth.** Rode `db/schemas.sql` inteiro. Crie todas as tabelas com RLS habilitado desde o primeiro momento. Configure `handle_new_user()` (trigger que popula `profiles`) e os helpers `current_profile_role()` / `is_production_manager(site_id)`. Modele `sites` e `site_members` para papel efetivo por obra.
2. **Auth e navegação por papel.** Tela `/login` e roteamento condicional aos três papéis (recebimento, laje, gestor). Sem isso, nenhuma tela de campo faz sentido.
3. **Páginas de campo (PWA offline).** Registro de recebimento do caminhão (slump, NF, número do caminhão, responsável técnico, FCK do traço, peça a ser concretada, temperatura só em peças especiais) e rastreabilidade na laje. Implemente captura de foto + fila de sincronização offline aqui.
4. **Functions e integrações (Fase 2).** Edge Functions de OCR/leitura: foto de NF → preenchimento automático; PDF de laudo de ensaio → casa pelo número da nota fiscal e preenche a resistência de 7/28 dias. Cálculo de conformidade (alerta quando `fck` do ensaio < `fck_target` da peça). `notify-manager` e `approve_concreting()`.
5. **Automação recorrente.** Cron (pg_cron) para janelas de ensaio (lembrete/pendência de resultado aos 7 e 28 dias) e alertas de laudo em atraso.
6. **Polimento (Fase 3).** Relatórios de conformidade e tendências, Realtime na laje, estados vazio/erro/loading, ajuste fino do offline.

Nunca pule para funções de IA antes do banco e do RLS estarem prontos — o OCR grava em tabelas que precisam existir e estar protegidas.

---

## Como usar cada documento durante o desenvolvimento

- **`docs/PRD.md`** — leia antes de começar qualquer fase para não perder o objetivo: eliminar o tempo de alimentação manual da planilha. Consulte quando estiver em dúvida sobre escopo ("isso resolve a dor do Excel?").
- **`docs/PRS.md`** — a fonte dos requisitos testáveis (RF-01 auth/papéis, RF-02 concretagem, etc.). Antes de dar uma tarefa como pronta, encontre o RF correspondente e verifique se o critério foi atendido.
- **`db/schemas.sql`** — **fonte única do modelo de dados.** Consulte SEMPRE antes de criar/alterar qualquer tabela ou coluna. Se algo que você precisa não existe aqui, pare — não improvise; a tabela provavelmente já tem outro nome.
- **`docs/PLANO.md`** — o mapa de fases e dependências. Consulte ao decidir "o que fazer agora" e para não implementar algo fora de ordem.
- **`docs/FUNCTIONS.md`** — catálogo de TODAS as Edge Functions/RPCs/triggers/cron com contrato e autenticação. Antes de codar qualquer lógica server-side (OCR, conformidade, notificação, aprovação), releia a entrada da função lá e use o nome/assinatura exatos.
- **`docs/PAGINAS.md`** — antes de construir QUALQUER tela, releia a seção dela (rota, propósito, papel, comportamento offline). Não crie tela nem rota fora deste documento.
- **`docs/DEPARA.md`** — a matriz tabela ↔ function ↔ página. Antes de criar uma tabela, função ou página nova, confira aqui para **não duplicar** algo existente e garantir que nada fique órfão. Use como checklist de consistência de nomes.
- **`docs/PROCESSO.md`** — a verdade sobre o fluxo real de obra e os papéis. Consulte sempre que uma regra de negócio ou permissão estiver ambígua (quem confere o quê, quem aprova, o que é peça especial).

---

## Gates de qualidade

Antes de considerar QUALQUER etapa concluída, verifique:

- [ ] **RLS habilitado** em toda tabela nova, com policies por papel efetivo (`site_members.site_role`) e por obra (`site_id`). Nenhuma tabela sem policy.
- [ ] **Nomes batem com `docs/DEPARA.md`** e `db/schemas.sql` — tabela, coluna, function e rota idênticas.
- [ ] **Regra de negócio do `docs/PROCESSO.md` aplicada de fato:** recebimento confere slump/NF/caminhão; laje registra a peça; gestor é o único que aprova a concretagem; temperatura só é exigida em peças especiais.
- [ ] **Alerta de fck funcionando:** quando a resistência do laudo (7 ou 28 dias) for menor que o `fck_target` da peça, o sistema alerta.
- [ ] **Casamento por nota fiscal:** o laudo em PDF é vinculado à concretagem pelo `invoice_number`, preenchendo a resistência automaticamente.
- [ ] **Offline testado:** registro de campo sem internet entra na fila e sincroniza depois sem duplicar; foto é guardada e as informações extraídas via OCR são preenchidas.
- [ ] **Estados de UI:** vazio, carregando e erro implementados em toda página (incluindo o estado "aguardando resultado de ensaio").
- [ ] **RF correspondente do `docs/PRS.md`** atendido e conferido.

---

## O que NÃO fazer

- **Não** usar outro banco (Firebase, MongoDB, Supabase é o backend — ponto). Sem exceção.
- **Não** criar tabela, coluna, função ou rota que não exista em `db/schemas.sql` / `docs/FUNCTIONS.md` / `docs/PAGINAS.md`. Se faltar algo, verifique primeiro se já existe com outro nome no `docs/DEPARA.md`.
- **Não** deixar RLS "para depois". Toda tabela nasce com RLS e policies.
- **Não** misturar os papéis do `docs/PROCESSO.md`: técnico de recebimento e técnico de laje não aprovam concretagem; só o gestor de produção aprova.
- **Não** usar papel global — permissão é sempre por obra via `site_members.site_role`.
- **Não** exigir temperatura em toda concretagem: ela é obrigatória apenas em peças especiais.
- **Não** assumir internet estável: nenhuma tela de campo pode depender de conexão para registrar; tudo funciona offline com sync posterior.
- **Não** fazer OCR/leitura de laudo no frontend — isso roda em Edge Function (Deno), com o resultado gravado no banco.
- **Não** usar N8N nem Zapier para automação; recorrências são pg_cron/Edge Functions.
- **Não** trocar a stack do frontend (nada de Next.js/Vue/Angular) — é React gerado no Lovable como PWA.
- **Não** reintroduzir trabalho manual de planilha: qualquer campo que possa vir de foto de NF ou de PDF de laudo deve ser preenchido automaticamente pela IA, não digitado à mão.
