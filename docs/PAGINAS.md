# Páginas do Frontend — RastreConcreto

> Frontend gerado no **Lovable** (React + Tailwind + shadcn/ui) como **PWA**, com integração nativa ao Supabase e suporte a **funcionamento offline com sincronização posterior** nas telas de campo. Todas as páginas exigem usuário autenticado, exceto `/login`.
>
> **Papéis (do PROCESSO):** Técnico de recebimento (in loco), Técnico de rastreabilidade na laje (in loco) e Gestor de produção. Um mesmo profissional pode acumular papéis. O papel efetivo por obra vem de `site_members.site_role`.

---

### /login

- **Rota:** `/login`
- **Propósito:** Autenticar o profissional para acessar o RastreConcreto.
- **Seções da tela:**
  - Logo e título "RastreConcreto".
  - Formulário de e-mail/senha (login principal da equipe de campo).
  - Botão "Entrar com link mágico" (magic link — opção para o gestor no escritório sem gerenciar senha).
  - Link "Esqueci minha senha".
- **Estados:**
  - *Vazio:* formulário limpo, botões habilitados.
  - *Carregando:* botão "Entrar" com spinner, campos desabilitados enquanto autentica.
  - *Erro:* mensagem de credenciais inválidas ou link expirado; se offline, aviso "Sem conexão — o login precisa de internet".
- **Permissões:** Pública (não autenticada). Todos os papéis usam a mesma tela; o redirecionamento pós-login depende do papel/obra.

---

### / (Dashboard)

- **Rota:** `/`
- **Propósito:** Dar a visão geral do dia por obra, destacando concretagens em andamento, pendências de ensaio e alertas de não conformidade.
- **Seções da tela:**
  - Seletor de obra ativa (para quem é membro de mais de uma obra).
  - Cards-resumo: concretagens do dia, concretagens aguardando aprovação, ensaios pendentes (7/28 dias), alertas abertos.
  - Lista de concretagens do dia com status (`in_progress`, `pending_approval`, `approved`, `rejected`).
  - Bloco de alertas de não conformidade recentes.
  - Botão flutuante "Nova concretagem".
  - Indicador de sincronização (registros offline pendentes de envio).
- **Estados:**
  - *Vazio:* mensagem "Nenhuma concretagem hoje" com CTA "Iniciar concretagem".
  - *Carregando:* skeletons nos cards e na lista.
  - *Erro:* aviso "Não foi possível carregar o painel" com botão "Tentar novamente"; em modo offline mostra os dados em cache com faixa "Exibindo dados offline".
- **Permissões:** Todos os papéis. Para técnicos, os cards enfatizam registro de campo e sincronização; para o gestor, aparecem também os atalhos de aprovações pendentes e alertas.

---

### /obras

- **Rota:** `/obras`
- **Propósito:** Listar as obras (`sites`) que o usuário acessa e permitir ao gestor criar/editar obras.
- **Seções da tela:**
  - Lista/grade de obras (nome, código, endereço, status ativo).
  - Botão "Nova obra" (somente gestor).
  - Formulário/modal de criação e edição de obra (somente gestor).
  - Acesso rápido a membros, traços e peças de cada obra.
- **Estados:**
  - *Vazio:* "Você ainda não participa de nenhuma obra" (técnico) ou "Cadastre a primeira obra" (gestor).
  - *Carregando:* skeleton dos cards de obra.
  - *Erro:* mensagem de falha ao carregar com "Tentar novamente".
- **Permissões:** Todos os papéis veem as obras de que são membros. Criar/editar obra: apenas **Gestor de produção**. Técnicos veem em modo somente leitura.

---

### /obras/:siteId/traços

- **Rota:** `/obras/:site-id/tracos`
- **Propósito:** Cadastrar e manter os traços/dosagens de concreto (`concrete_mixes`) com o fck exigido.
- **Seções da tela:**
  - Lista de traços da obra (nome, fck exigido em MPa, central/fornecedor).
  - Botão "Novo traço" (gestor).
  - Formulário de traço: nome, fck exigido, fornecedor, observações.
- **Estados:**
  - *Vazio:* "Nenhum traço cadastrado" com CTA "Cadastrar traço" (gestor).
  - *Carregando:* skeleton de lista.
  - *Erro:* aviso de falha ao carregar/salvar.
- **Permissões:** Membros da obra visualizam (necessário para o recebimento selecionar o traço). Criar/editar/excluir: apenas **Gestor de produção**.

---

### /obras/:siteId/pecas

- **Rota:** `/obras/:site-id/pecas`
- **Propósito:** Cadastrar as peças/locais que podem ser concretados (`pieces`), marcando peças especiais e o fck exigido de cada uma.
- **Seções da tela:**
  - Lista de peças (nome, fck exigido, marcação de peça especial, descrição do local).
  - Filtro por peças especiais.
  - Botão "Nova peça" (gestor).
  - Formulário de peça: nome, fck exigido, toggle "peça especial" (que torna a temperatura obrigatória no recebimento), descrição do local.
- **Estados:**
  - *Vazio:* "Nenhuma peça cadastrada" com CTA "Cadastrar peça".
  - *Carregando:* skeleton de lista.
  - *Erro:* aviso de falha ao carregar/salvar.
- **Permissões:** Membros da obra visualizam (o técnico da laje seleciona a peça no lançamento). Criar/editar/excluir: apenas **Gestor de produção**.

---

### /concretagens

- **Rota:** `/concretagens`
- **Propósito:** Listar todas as concretagens com status e permitir filtrar por data e obra.
- **Seções da tela:**
  - Filtros: obra, intervalo de datas, status.
  - Lista de concretagens (título, data, status, nº de recebimentos e lançamentos).
  - Botão "Nova concretagem".
  - Badge de status colorido por etapa.
- **Estados:**
  - *Vazio:* "Nenhuma concretagem no período" com CTA "Nova concretagem".
  - *Carregando:* skeleton de linhas da lista.
  - *Erro:* aviso de falha; em offline mostra as concretagens em cache com faixa "dados offline".
- **Permissões:** Todos os papéis (membros da obra). O gestor vê ações de aprovação; os técnicos veem foco em registro. Registros criados offline aparecem com marcador "aguardando sincronização".

---

### /concretagens/nova

- **Rota:** `/concretagens/nova`
- **Propósito:** Iniciar uma nova concretagem no dispositivo, funcionando mesmo offline.
- **Seções da tela:**
  - Formulário: obra, data (padrão hoje), título (ex.: "Laje 3º pavimento").
  - Aviso de modo offline ("Este registro será salvo no dispositivo e sincronizado depois").
  - Botão "Criar concretagem" que leva direto às telas de recebimento/lançamento.
- **Estados:**
  - *Vazio:* formulário pré-preenchido com a data de hoje e a obra ativa.
  - *Carregando:* botão em processamento ao salvar (ou "salvo localmente" quando offline).
  - *Erro:* validação de campos obrigatórios; se offline, confirma salvamento local sem bloquear.
- **Permissões:** Qualquer técnico membro da obra e o gestor. Todos os papéis de campo podem iniciar uma concretagem.

---

### /recebimento/:concretingId

- **Rota:** `/recebimento/:concreting-id`
- **Propósito:** Tela do técnico de recebimento para registrar cada caminhão betoneira com foto da NF, caminhão, slump, temperatura e fck do traço.
- **Seções da tela:**
  - Cabeçalho com a concretagem vinculada.
  - Captura de foto da nota fiscal (câmera do dispositivo) com preview.
  - Campo "número da nota fiscal" preenchido automaticamente pelo OCR (`ocr_status`: pendente/processando/concluído/falha), editável.
  - Campo número do caminhão betoneira.
  - Seleção do traço (fck do traço como snapshot).
  - Campo slump test (cm).
  - Toggle/derivação "peça especial" que torna a temperatura obrigatória.
  - Botão "Confirmar recebimento".
  - Lista dos recebimentos já registrados na concretagem.
- **Estados:**
  - *Vazio:* formulário limpo, sem recebimentos anteriores.
  - *Carregando:* indicador de OCR processando a foto; botão em processamento ao salvar.
  - *Erro:* validação de campos obrigatórios (fck, NF, caminhão, slump); OCR falhou → aviso "Não foi possível ler a NF, preencha o número manualmente"; offline → "salvo no dispositivo, OCR e sincronização ocorrerão ao reconectar".
- **Permissões:** **Técnico de recebimento** (e quem acumular o papel) e gestor. Edição permitida ao `received_by` enquanto a concretagem não estiver aprovada.

---

### /lancamento/:concretingId

- **Rota:** `/lancamento/:concreting-id`
- **Propósito:** Tela do técnico na laje para registrar em quais peças o concreto está sendo lançado, com responsável e fotos.
- **Seções da tela:**
  - Cabeçalho com a concretagem em andamento.
  - Seleção da peça/local (`pieces`).
  - Seleção do caminhão de origem (`truck_receipt`) do lançamento.
  - Seleção do responsável técnico do lançamento.
  - Captura de fotos do lançamento/peça (múltiplas, com legenda).
  - Campo de observações.
  - Botão "Registrar lançamento".
  - Lista dos lançamentos já feitos na concretagem.
- **Estados:**
  - *Vazio:* "Nenhum lançamento registrado ainda" com foco na seleção de peça.
  - *Carregando:* upload de fotos em progresso; botão em processamento ao salvar.
  - *Erro:* validação (peça e responsável obrigatórios); offline → registros e fotos ficam em fila local com "aguardando sincronização".
- **Permissões:** **Técnico de rastreabilidade na laje** (e quem acumular o papel) e gestor. Edição permitida ao `recorded_by` enquanto não aprovado.

---

### /concretagens/:id

- **Rota:** `/concretagens/:id`
- **Propósito:** Mostrar o detalhe completo de uma concretagem: recebimentos, lançamentos, fotos e status de aprovação.
- **Seções da tela:**
  - Cabeçalho: título, data, obra, status.
  - Bloco de recebimentos (NF, caminhão, slump, temperatura, fck do traço, foto da NF).
  - Bloco de lançamentos (peça, responsável, caminhão de origem, fotos).
  - Galeria de fotos vinculadas.
  - Painel de status/aprovação (aprovado por, quando).
  - Botão "Enviar para aprovação" (técnico/criador) e ações de aprovar/rejeitar (gestor).
- **Estados:**
  - *Vazio:* seções indicando "Nenhum recebimento/lançamento registrado".
  - *Carregando:* skeletons por bloco; fotos com placeholder até o carregamento das URLs assinadas.
  - *Erro:* aviso de falha ao carregar; em offline, exibe dados em cache marcando os itens ainda não sincronizados.
- **Permissões:** Todos os membros da obra visualizam. Enviar para aprovação: o criador enquanto `in_progress`. Aprovar/rejeitar: apenas **Gestor de produção**.

---

### /aprovacoes

- **Rota:** `/aprovacoes`
- **Propósito:** Fila do gestor com as concretagens aguardando aprovação para revisar e aprovar/rejeitar.
- **Seções da tela:**
  - Lista de concretagens com status `pending_approval` (título, data, obra, resumo de completude).
  - Indicador de dados obrigatórios faltantes (FCK, NF, caminhão, slump).
  - Ações "Aprovar" e "Rejeitar" com campo de justificativa.
  - Link para o detalhe completo de cada concretagem.
- **Estados:**
  - *Vazio:* "Nenhuma concretagem aguardando aprovação".
  - *Carregando:* skeleton da fila.
  - *Erro:* aviso de falha; bloqueio de aprovação quando o recebimento estiver incompleto (regra `approve_concreting`).
- **Permissões:** Apenas **Gestor de produção**. Técnicos não acessam esta página.

---

### /laudos

- **Rota:** `/laudos`
- **Propósito:** Enviar laudos de ensaio em PDF e acompanhar a extração automática e os resultados de 7/28 dias.
- **Seções da tela:**
  - Área de upload de PDF (arrastar/soltar ou selecionar).
  - Lista de laudos enviados com `extraction_status` (pendente/processando/concluído/precisa revisão/falha).
  - Detalhe do laudo: número da NF extraído, vínculo com o recebimento, resultados de resistência (idade, fck medido, fck exigido, conforme/não conforme).
  - Painel de "revisão manual" quando o vínculo pela NF não é único (`needs_review`).
- **Estados:**
  - *Vazio:* "Nenhum laudo enviado" com CTA "Enviar laudo em PDF".
  - *Carregando:* barra de upload e badge "processando" durante a extração pela IA.
  - *Erro:* extração falhou → "Não foi possível ler o laudo, revise manualmente"; NF sem correspondência → marca `needs_review` com formulário de vínculo manual.
- **Permissões:** Apenas **Gestor de produção** faz upload e revisão. A extração e a inserção de resultados ocorrem via Edge Function (service role).

---

### /alertas

- **Rota:** `/alertas`
- **Propósito:** Listar os alertas de não conformidade (fck medido abaixo do exigido) para o gestor reconhecer e resolver.
- **Seções da tela:**
  - Lista de alertas (`nonconformity_alerts`) com peça, caminhão/NF, idade (7/28 dias), fck medido x exigido, severidade e status.
  - Filtros por status (`open`, `acknowledged`, `resolved`).
  - Ações "Reconhecer" e "Resolver" com registro de quem reconheceu.
  - Link para o resultado de resistência e a concretagem de origem.
- **Estados:**
  - *Vazio:* "Nenhum alerta de não conformidade" (estado positivo/verde).
  - *Carregando:* skeleton da lista.
  - *Erro:* aviso de falha ao carregar/atualizar status.
- **Permissões:** **Gestor de produção** reconhece/resolve. Membros da obra podem visualizar (leitura), mas as ações de status são exclusivas do gestor.

---

### /pendencias

- **Rota:** `/pendencias`
- **Propósito:** Acompanhar os ensaios ainda não recebidos (7 ou 28 dias) por lote/concretagem até o fechamento.
- **Seções da tela:**
  - Lista de pendências (`pending_tests`): caminhão/NF, idade esperada (7/28 dias), data prevista (`due_date`), situação.
  - Destaque para pendências vencidas (em atraso).
  - Filtros por concretagem, obra e idade.
  - Indicador de itens já recebidos vs. pendentes.
- **Estados:**
  - *Vazio:* "Nenhum ensaio pendente".
  - *Carregando:* skeleton da lista.
  - *Erro:* aviso de falha ao carregar.
- **Permissões:** Todos os membros da obra visualizam. O acompanhamento e a cobrança são função do **Gestor de produção** (notificação de atraso via cron/email).

---

### /relatorios

- **Rota:** `/relatorios`
- **Propósito:** Gerar relatórios de conformidade e análises de tendência de qualidade, com texto em linguagem natural e exportação de planilha.
- **Seções da tela:**
  - Filtros: obra, período, traço/peça.
  - Bloco de indicadores de conformidade (taxa de conformidade 7/28 dias, alertas no período).
  - Gráfico de tendência de resistência (fck medido ao longo do tempo).
  - Relatório em linguagem natural gerado pela IA (com botão "Gerar relatório").
  - Botão "Exportar planilha" (substitui/espelha o Excel atual).
- **Estados:**
  - *Vazio:* "Sem dados suficientes para gerar relatório no período".
  - *Carregando:* skeleton dos indicadores e badge "gerando relatório" durante a chamada de IA/exportação.
  - *Erro:* aviso de falha na geração/exportação com "Tentar novamente".
- **Permissões:** Apenas **Gestor de produção**. É a tela que consolida a análise de qualidade e a exportação para fora do Excel.

---

### /configuracoes

- **Rota:** `/configuracoes`
- **Propósito:** Gerenciar o próprio perfil e, para o gestor, os membros da obra e seus papéis.
- **Seções da tela:**
  - Dados do perfil (nome, e-mail, telefone) editáveis pelo próprio usuário.
  - Preferências de notificação.
  - Lista de membros da obra com papéis (`site_role`) — visível/editável pelo gestor.
  - Ações de convidar membro, alterar papel e ativar/desativar profissional (`is_active`) — gestor.
- **Estados:**
  - *Vazio:* "Nenhum membro além de você nesta obra" (para o gestor).
  - *Carregando:* skeleton dos dados de perfil e da lista de membros.
  - *Erro:* aviso de falha ao salvar perfil ou atualizar membro.
- **Permissões:** Todos os papéis editam o **próprio perfil**. Gerenciar membros e papéis: apenas **Gestor de produção**. Técnicos veem a lista de membros em modo somente leitura.
