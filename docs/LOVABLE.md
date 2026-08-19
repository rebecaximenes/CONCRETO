# Projeto no Lovable — RastreConcreto

O **frontend oficial** do RastreConcreto é construído no Lovable, com a identidade
visual da Construtora Record (a mesma do Diário de Obra). Este repositório guarda o
**banco** (`db/`, `supabase/migrations/`), as **Edge Functions** (`supabase/functions/`)
e a **documentação** — que continuam sendo a fonte canônica de nomes e regras.

| | |
|---|---|
| Projeto | `b88a8758-cf53-4f77-8e3c-31433a4559ff` |
| Editor | https://lovable.dev/projects/b88a8758-cf53-4f77-8e3c-31433a4559ff |
| Preview | https://id-preview--b88a8758-cf53-4f77-8e3c-31433a4559ff.lovable.app |
| Banco | Supabase provisionado pelo Lovable (Lovable Cloud) |

## Estado do banco desse projeto

Aplicado e conferido: 14 tabelas (todas com RLS), 47 policies em `public`,
12 policies de Storage, os 3 buckets privados, 9 funções e 23 triggers — ou seja,
`db/schemas.sql` + as três migrações deste repositório.

Ao mexer no schema, altere **primeiro** o SQL versionado aqui e só depois aplique
no projeto Lovable, para os dois não divergirem.

## Identidade visual (tokens Record)

```
--primary:    oklch(0.395 0.115 18);   /* vinho Record #732230 */
--secondary:  oklch(0.2 0 0);          /* grafite #1a1a1a */
--background: oklch(0.958 0.005 295);  /* cinza institucional #f1f0f5 */
--accent:     oklch(0.32 0.11 11);     /* vinho escuro do gradiente */
--radius: 0.375rem;  fonte: Archivo
```

Utilitários: `record-hero` (fundo do login), `record-header`, `surface-card`,
`brand-bar`. Tagline em caixa alta com `tracking-[0.22em]`:
"Qualidade · Inovação · Sustentabilidade".

## Segredos que faltam configurar

Nos secrets do projeto (Supabase / Lovable), antes de a leitura por IA funcionar:

| Segredo | Para que serve |
|---|---|
| `GEMINI_API_KEY` | Leitura da foto da NF e do PDF do laudo (Gemini 2.5 Pro) |
| `RESEND_API_KEY` | E-mail ao gestor (`notify-manager`) |
| `RESEND_FROM` | Remetente verificado no Resend (opcional) |
| `APP_URL` | Base dos links dentro do e-mail (opcional) |

## Bootstrap da primeira obra

Vale o mesmo `db/bootstrap.sql`: a policy `sites_insert` exige um gestor de produção
já existente, e o `handle_new_user()` cria todo mundo como `field_tech`. Cadastre o
gestor pelo `/login` e rode o bootstrap uma vez.
