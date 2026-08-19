# RastreConcreto

Plataforma de rastreabilidade do ciclo de vida do concreto em obra — do recebimento
do caminhão betoneira até os ensaios de resistência de 7 e 28 dias — criada para
substituir a planilha de Excel que "demanda muito tempo para alimentar".

- **Backend:** Supabase (PostgreSQL + RLS + Auth + Storage + Edge Functions + Realtime + pg_cron)
- **Frontend:** React + Vite + Tailwind + shadcn/ui, empacotado como **PWA** para uso
  em celular/tablet na frente de obra
- **Documentação canônica:** [`SKILL.md`](SKILL.md) primeiro, depois `docs/` e `db/schemas.sql`

> **Antes de mexer no código, leia o [`SKILL.md`](SKILL.md).** Ele define as convenções
> de nome, a ordem das fases e o que não fazer. `db/schemas.sql`, `docs/FUNCTIONS.md` e
> `docs/PAGINAS.md` são as fontes canônicas de tabelas, funções e rotas.

## Estado atual — Fase 1 (Fundação) concluída

| Entregável da fase 1 (`docs/PLANO.md`) | Onde está |
|---|---|
| Banco completo com RLS | `db/schemas.sql` |
| Trigger `handle_new_user()` | `supabase/migrations/20260819000200_handle_new_user.sql` |
| Buckets privados de Storage com política por obra | `supabase/migrations/20260819000300_storage_buckets.sql` |
| Login (e-mail/senha, link mágico, recuperar senha) | `src/pages/Login.tsx` |
| Layout base, seletor de obra e menu por papel | `src/components/layout/` |
| Dashboard `/` por obra | `src/pages/Dashboard.tsx` |

As telas de campo (recebimento, lançamento na laje), as Edge Functions de OCR/laudo e
o modo offline entram nas fases 2 e 3 do `docs/PLANO.md`. No menu, esses itens aparecem
marcados como "em breve".

## Como rodar o banco

No **SQL Editor** do Supabase, nesta ordem:

1. `db/schemas.sql` — 14 tabelas, índices, RLS habilitado, policies e os helpers
   `is_site_member` / `is_production_manager` / `current_profile_role`.
2. `supabase/migrations/20260819000200_handle_new_user.sql` — cria o `profiles`
   automaticamente depois do signup.
3. `supabase/migrations/20260819000300_storage_buckets.sql` — buckets `invoice-photos`,
   `placement-photos` e `test-reports` (privados) com acesso restrito aos membros da obra.
4. `db/bootstrap.sql` — **uma vez só**, para promover o primeiro gestor de produção e
   criar a primeira obra (a policy `sites_insert` exige um gestor já existente).

Em Authentication > Providers, deixe **Email** habilitado (senha e magic link).

> **Convenção de caminho no Storage:** todo objeto começa pelo uuid da obra —
> `<site_id>/...`. É essa primeira pasta que as policies usam para decidir quem lê e
> quem grava. Uploads fora desse padrão são bloqueados.

## Como rodar o app

```bash
npm install
cp .env.example .env    # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev             # http://localhost:8080
```

Scripts: `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`, `npm run typecheck`.

## Papéis

O papel **efetivo** é sempre `site_members.site_role` — por obra, nunca global.
`profiles.role` é apenas o papel padrão com que a pessoa foi cadastrada.

| Papel | `site_role` | O que faz (docs/PROCESSO.md) |
|---|---|---|
| Técnico de recebimento | `receiving_tech` | Confere slump, nota fiscal e número do caminhão |
| Técnico na laje | `slab_tech` | Registra em que peças o concreto foi lançado |
| Técnico de campo | `field_tech` | Papel padrão, acumula funções de campo |
| Gestor de produção | `production_manager` | Único que aprova a concretagem; envia laudos e vê relatórios |

## Estrutura

```
db/                 schemas.sql (fonte única do modelo) e bootstrap.sql
docs/               PRD, PRS, PROCESSO, ESTRUTURA, PLANO, FUNCTIONS, PAGINAS, DEPARA
supabase/migrations/ migrações da fase 1 (trigger de signup e Storage)
src/pages/          telas por rota do docs/PAGINAS.md
src/components/     layout, autenticação e primitivas de UI (shadcn)
src/providers/      sessão/perfil (AuthProvider) e obra ativa (SiteProvider)
src/integrations/   cliente e tipos do Supabase (espelham db/schemas.sql)
```
