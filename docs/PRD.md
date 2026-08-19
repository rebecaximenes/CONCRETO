## 1. Contexto

O **RastreConcreto** é uma plataforma de controle e rastreabilidade do ciclo de vida do concreto em obra, criada para substituir a planilha de Excel que hoje "demanda muito tempo para alimentar". A operação envolve equipes de campo — técnicos de edificações que operam via celular ou tablet, muitas vezes sem internet estável na frente de obra — e a gestão de produção, que trabalha no escritório. O fluxo cobre desde o recebimento do caminhão betoneira (conferência de slump, nota fiscal e número do caminhão) até o resultado final dos ensaios de resistência aos 7 e 28 dias, passando pelo registro do lançamento do concreto em cada peça da laje. O grande diferencial é a leitura automática dos laudos de ensaio em PDF: em vez de digitação manual no Excel, o RastreConcreto interpreta o laudo, cruza pela nota fiscal e preenche os dados automaticamente, alertando quando o fck medido fica abaixo do fck exigido pela peça.

## 2. Problema

Hoje toda a rastreabilidade do concreto é feita em uma planilha de Excel que, nas palavras do próprio usuário, "demanda muito tempo para alimentar". A alimentação é manual em duas frentes críticas: (1) no campo, o técnico precisa transcrever à mão número da nota fiscal, caminhão betoneira, slump e fck do traço — muitas vezes sem internet estável, o que impede o uso de qualquer sistema online tradicional; e (2) no escritório, o gestor recebe os laudos de ensaio em PDF (resultados de 7 e 28 dias) e precisa digitar cada resultado de resistência na planilha, cruzando manualmente pelo número da nota fiscal citado no laudo. Esse processo é lento, sujeito a erro de digitação e não avisa automaticamente quando uma peça está fora do fck exigido — a não conformidade só é percebida se alguém comparar os números na mão. O resultado é retrabalho, risco de perda de rastreabilidade e demora para detectar problemas de resistência estrutural.

## 3. Objetivos

1. **Eliminar a digitação manual dos laudos**: extrair automaticamente número da NF, idade (7/28 dias) e fck medido de ≥ 90% dos laudos em PDF enviados, sem digitação, usando a nota fiscal como chave de vínculo.
2. **Registrar em campo com ou sem internet**: permitir 100% dos registros de recebimento e lançamento offline no celular/tablet, com sincronização automática e sem perda de dados quando a conexão retornar.
3. **Detectar não conformidade automaticamente**: gerar alerta em até 1 minuto após a extração do laudo sempre que o fck medido for menor que o fck exigido pela peça, aos 7 ou aos 28 dias.
4. **Reduzir o tempo de alimentação de dados** em relação à planilha atual, com o registro estruturado dentro da plataforma substituindo o Excel e permitindo exportação.
5. **Dar visibilidade de pendências e conformidade** ao gestor com dashboard e relatórios de conformidade e tendência de qualidade gerados sob demanda.

## 4. Personas

### Rogério — Técnico de recebimento (in loco)
- **Papel:** técnico de edificações que recebe o caminhão de concreto na frente de obra.
- **Dor:** precisa conferir slump, nota fiscal e número do caminhão sob pressão de tempo (o caminhão espera para descarregar) e frequentemente sem internet.
- **Objetivo:** registrar o recebimento rápido, fotografando a NF em vez de digitar, mesmo offline.
- **Citação:** *"Na hora da concretagem, terá um profissional recebendo o caminhão de concreto e conferindo slump, nota fiscal, número do caminhão."*

### Marina — Técnica de rastreabilidade na laje (in loco)
- **Papel:** técnica de edificações que registra em quais peças/locais o concreto está sendo lançado durante a concretagem.
- **Dor:** o concreto avança rápido pela laje e ela precisa acompanhar peça a peça, muitas vezes com internet instável, sem perder o vínculo com o responsável técnico.
- **Objetivo:** registrar cada lançamento e capturar fotos das peças com sincronização posterior.
- **Citação:** *"Terá um outro profissional na laje que estará executando a rastreabilidade, vendo em que locais o concreto está sendo lançado."*

### Eduardo — Gestor de produção
- **Papel:** aprova cada concretagem realizada e acompanha relatórios e alertas.
- **Dor:** perde tempo digitando laudos de ensaio no Excel e comparando fck manualmente para saber se há não conformidade.
- **Objetivo:** enviar o laudo em PDF e ter a planilha preenchida sozinha, com alerta automático quando o fck ficar abaixo do exigido.
- **Citação:** *"Vamos enviar os laudos de ensaios e a planilha será preenchida automaticamente pela IA... quando a resistência fck for menor que o fck da peça, alertar."*

## 5. Requisitos funcionais

- **RF-01:** O sistema deve permitir que o técnico de recebimento inicie um novo registro de recebimento vinculado à concretagem do dia.
- **RF-02:** O sistema deve permitir que o técnico de recebimento fotografe a nota fiscal e ter o número da NF preenchido automaticamente por leitura de imagem (OCR).
- **RF-03:** O sistema deve permitir que o técnico de recebimento registre o número do caminhão betoneira.
- **RF-04:** O sistema deve permitir que o técnico de recebimento informe o resultado do slump test.
- **RF-05:** O sistema deve permitir que o técnico de recebimento registre a temperatura apenas quando a peça for especial, mantendo o campo opcional nas demais.
- **RF-06:** O sistema deve permitir que o técnico de recebimento confirme o FCK do traço recebido.
- **RF-07:** O sistema deve exigir FCK do traço, número da nota fiscal, número do caminhão betoneira e slump test para considerar o recebimento completo.
- **RF-08:** O sistema deve permitir que o técnico de recebimento salve o registro localmente quando a internet estiver instável e sincronizá-lo automaticamente quando a conexão retornar, sem perda nem duplicação de dados.
- **RF-09:** O sistema deve permitir que o técnico de rastreabilidade selecione a concretagem em andamento associada ao recebimento já registrado.
- **RF-10:** O sistema deve permitir que o técnico de rastreabilidade registre o local do lançamento (a peça a ser concretada) à medida que o concreto é lançado.
- **RF-11:** O sistema deve permitir que o técnico de rastreabilidade associe o responsável técnico a cada lançamento.
- **RF-12:** O sistema deve permitir que o técnico de rastreabilidade capture fotos do lançamento/peça, armazenando-as vinculadas ao registro correspondente.
- **RF-13:** O sistema deve permitir que o técnico de rastreabilidade registre múltiplas peças em sequência e encerre a rastreabilidade ao final da concretagem, operando offline com sincronização posterior.
- **RF-14:** O sistema deve permitir que o gestor de produção visualize a lista de concretagens do dia/período com seus status.
- **RF-15:** O sistema deve permitir que o gestor de produção revise os dados de cada concretagem (FCK do traço, peças, NF, caminhão, slump, temperatura de peças especiais e responsável técnico).
- **RF-16:** O sistema deve permitir que o gestor de produção aprove ou rejeite a concretagem realizada, registrando autor e data da aprovação.
- **RF-17:** O sistema deve permitir que o gestor de produção envie laudos de ensaio em PDF (resultados de 7 e 28 dias) à plataforma.
- **RF-18:** O sistema deve ler o laudo em PDF, identificar o número da nota fiscal citado nele e preencher automaticamente os resultados de resistência, usando a NF como chave de vínculo com a concretagem.
- **RF-19:** O sistema deve registrar os resultados de resistência nos dois marcos de idade (7 e 28 dias) para cada lote/recebimento.
- **RF-20:** O sistema deve disparar um alerta de não conformidade sempre que o fck medido no laudo for menor que o fck exigido pela peça, aos 7 ou aos 28 dias.
- **RF-21:** O sistema deve permitir que o gestor de produção reconheça (acknowledge) e resolva os alertas de não conformidade.
- **RF-22:** O sistema deve permitir que o gestor de produção acompanhe as pendências de ensaios ainda não recebidos (7 ou 28 dias) até o fechamento de cada lote e ser notificado sobre ensaios em atraso.
- **RF-23:** O sistema deve permitir que o gestor de produção gere relatórios de conformidade e análises de tendência de qualidade em linguagem natural a partir do histórico das concretagens.
- **RF-24:** O sistema deve permitir que o gestor de produção exporte os dados estruturados em planilha, espelhando/substituindo o Excel atual.
- **RF-25:** O sistema deve permitir que o gestor de produção cadastre e mantenha obras, traços (com fck exigido), peças (marcando peças especiais) e membros com seus papéis.
- **RF-26:** O sistema deve notificar o gestor de produção sobre nova concretagem aguardando aprovação e sobre alertas de não conformidade.

## 6. Requisitos não-funcionais

- **Operação offline:** as telas de recebimento e lançamento devem funcionar sem conexão (PWA), armazenando registros localmente com identificador de dispositivo (`client_local_id`) e sincronizando de forma idempotente, sem duplicar dados ao reconectar.
- **Performance:** telas de campo devem carregar e permitir registro em poucos segundos mesmo em conexão fraca; a extração de laudo/OCR roda de forma assíncrona em Edge Function, sem travar a interface do usuário.
- **Disponibilidade:** backend gerenciado no Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime, Cron), dimensionado no plano Pro para suportar armazenamento de fotos e PDFs e o volume de invocações de Edge Functions.
- **Segurança e acesso:** autenticação via Supabase Auth (email/senha e magic link); Row Level Security em todas as tabelas, com acesso restrito aos membros da obra e ações sensíveis (aprovação, criação de alerta) controladas por papel; buckets de Storage privados com leitura via URLs assinadas geradas server-side.
- **Integridade e auditoria:** aprovações e alterações sensíveis registradas em trilha de auditoria; alertas de não conformidade criados apenas por processo server-side (não editáveis pelo campo).
- **LGPD/dados pessoais:** os dados pessoais tratados restringem-se a profissionais internos (nome, e-mail, telefone, papel); não há cliente externo nesta versão. Devem ser garantidos acesso restrito por papel, possibilidade de desativação de usuário (sem exclusão física, via `is_active`) e armazenamento em provedor gerenciado com controle de acesso.
- **Confiabilidade da extração por IA:** laudos cujo vínculo pela NF não for resolvido de forma única devem ser marcados para revisão manual (`needs_review`) em vez de gravar dados incorretos.

## 7. Métricas de sucesso

1. **≥ 90% dos laudos em PDF** têm NF, idade e fck extraídos automaticamente sem digitação manual (o restante cai em revisão, não em erro).
2. **100% dos registros de campo** feitos offline sincronizam com sucesso e sem duplicação após o retorno da conexão.
3. **Alerta de não conformidade** gerado em até 1 minuto após a extração do laudo, em 100% dos casos em que o fck medido < fck exigido.
4. **Redução do tempo de alimentação de dados** por concretagem em relação à planilha de Excel atual (medido por comparação antes/depois com a equipe).
5. **≥ 95% das concretagens** passam por aprovação explícita do gestor com todos os campos obrigatórios (FCK, NF, caminhão, slump) preenchidos.

## 8. Fora de escopo

- **Perfil de cliente externo** consultando laudos ou certificados — não citado pelo usuário; apenas técnicos de campo e gestor de produção nesta versão.
- **Integração com ERP, sistema financeiro ou sistema de gestão de obras** (Sienge, Obra Prima, Construct etc.) — a rastreabilidade hoje é feita apenas em Excel e os laudos chegam em PDF; nenhuma integração foi solicitada.
- **Emissão de certificados/laudos formais em PDF para clientes** com assinatura ou layout normativo — não solicitado nesta versão.
- **Rastreabilidade de origem de materiais** (certificados de cimento, agregado, aditivo, dosagem da central/CPB) além do fck do traço — o usuário limitou os dados rastreados a FCK do traço, local, NF, caminhão, slump, temperatura (peças especiais) e responsável técnico.
- **Conformidade normativa automatizada específica** (ex.: verificação estatística completa da ABNT NBR 12655) — não solicitada; o alerta cobre a regra simples de fck medido < fck exigido.
- **Interpretação de fotos de corpos de prova por visão computacional** — o usuário indicou envio de laudos em PDF como fonte dos resultados; a IA de visão é usada para NF e leitura de PDF, não para análise de CPs por imagem.
- **Previsão preditiva avançada de qualidade** com modelos estatísticos dedicados — nesta versão a "tendência" é análise descritiva sobre o histórico, não um modelo preditivo treinado.
