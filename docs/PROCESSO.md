## 1. Visão geral

O **RastreConcreto** é uma plataforma de controle e rastreabilidade do ciclo de vida do concreto em obra, criada para substituir a planilha de Excel que hoje "demanda muito tempo para alimentar". A plataforma acompanha cada concretagem desde o recebimento do caminhão betoneira até o resultado final dos ensaios de resistência (aos 7 e 28 dias), passando pelo registro do lançamento nas peças da laje. É voltada para equipes de campo (técnicos de edificações que operam via celular ou tablet, inclusive sem internet estável) e para a gestão de produção, que aprova cada concretagem realizada. O grande diferencial é a leitura automática dos laudos de ensaio em PDF: em vez de digitar tudo à mão, o RastreConcreto interpreta o laudo, cruza pela nota fiscal e preenche a planilha automaticamente — além de alertar quando a resistência (fck) medida fica abaixo do fck exigido pela peça.

## 2. Papéis de usuário

- **Técnico de recebimento (in loco):** técnico de edificações que recebe o caminhão de concreto e confere slump, nota fiscal e número do caminhão betoneira.
- **Técnico de rastreabilidade na laje (in loco):** técnico de edificações que registra em quais peças/locais o concreto está sendo lançado durante a concretagem.
- **Gestor de produção:** aprova cada concretagem realizada e acompanha relatórios de conformidade e tendências.

> Observação: um mesmo profissional pode acumular papéis dependendo da equipe presente na obra, mas as funções de recebimento e de rastreabilidade na laje são descritas separadamente conforme você indicou ("um profissional recebendo o caminhão" e "outro profissional na laje").

## 3. Processo passo a passo por papel

### Técnico de recebimento (in loco)

1. Abre o RastreConcreto no celular ou tablet na frente de obra, ao chegar o caminhão betoneira.
2. Inicia um novo registro de recebimento vinculado à concretagem do dia.
3. Fotografa a nota fiscal do concreto; a plataforma lê a imagem e preenche automaticamente o número da nota fiscal.
4. Registra o número do caminhão betoneira.
5. Informa o resultado do slump test.
6. Para peças especiais, registra a temperatura (nas demais peças esse campo não é exigido).
7. Confirma o FCK do traço recebido.
8. Se a internet estiver instável, salva tudo localmente no dispositivo; os dados sincronizam automaticamente assim que a conexão voltar.
9. Confirma o recebimento e libera o caminhão para descarga.

### Técnico de rastreabilidade na laje (in loco)

1. Abre o RastreConcreto no dispositivo móvel durante o lançamento do concreto.
2. Seleciona a concretagem em andamento (associada ao recebimento já registrado).
3. À medida que o concreto é lançado, registra o local do lançamento (a peça a ser concretada).
4. Associa o responsável técnico àquele lançamento.
5. Captura fotos do lançamento/peça quando necessário, que ficam guardadas e vinculadas ao registro.
6. Continua registrando cada peça conforme o concreto avança pela laje.
7. Trabalhando offline se a internet estiver ruim; os registros sincronizam automaticamente depois.
8. Encerra a rastreabilidade quando a concretagem daquela laje termina.

### Gestor de produção

1. Acessa o RastreConcreto no escritório e visualiza a lista de concretagens do dia/período.
2. Revisa os dados de cada concretagem: FCK do traço, peças concretadas, nota fiscal, caminhão, slump, temperatura (peças especiais) e responsável técnico.
3. Aprova a concretagem realizada.
4. Quando os laudos de ensaio chegam em PDF (resultados aos 7 e aos 28 dias), envia o laudo à plataforma.
5. A plataforma lê o laudo, identifica o número da nota fiscal citado nele e preenche automaticamente a planilha correspondente com os resultados de resistência.
6. Recebe um alerta automático sempre que o fck medido no laudo for menor que o fck exigido pela peça.
7. Consulta relatórios de conformidade e análises de tendência de qualidade com base no histórico das concretagens.
8. Acompanha pendências (ensaios ainda não recebidos aos 7 ou 28 dias) até o fechamento de cada lote.

## 4. Regras de negócio

- Regra: toda concretagem só é considerada aprovada após a validação explícita do gestor de produção.
- Regra: o registro de recebimento exige FCK do traço, número da nota fiscal, número do caminhão betoneira e slump test — sem esses campos o recebimento fica incompleto.
- Regra: a temperatura só é obrigatória para peças especiais; nas demais peças o campo é opcional.
- Regra: cada lançamento na laje deve estar associado a um local/peça concretada e a um responsável técnico.
- Regra: quando a internet estiver instável, os registros são salvos no dispositivo e sincronizados automaticamente quando a conexão retornar, sem perda de dados.
- Regra: ao enviar um laudo de ensaio em PDF, a plataforma extrai as informações e preenche a planilha automaticamente, usando o número da nota fiscal do laudo como chave de vínculo com a concretagem.
- Regra: fotos capturadas (nota fiscal, peça, lançamento) ficam armazenadas e vinculadas ao registro correspondente.
- Regra: os ensaios de resistência têm dois marcos — aos 7 dias e aos 28 dias; cada concretagem acompanha ambos os resultados.
- Regra: se o fck medido no laudo for menor que o fck exigido pela peça, o sistema dispara um alerta de não conformidade.

## 5. Suposições assumidas

- SUPOSIÇÃO: assumi que um resultado de ensaio recebido aos 7 dias abaixo do fck da peça também gera alerta (não só o de 28 dias), já que você mencionou receber resistência em ambos os marcos e alertar quando o fck for menor que o da peça.
- SUPOSIÇÃO: assumi que o vínculo entre laudo, concretagem e peça é feito pelo número da nota fiscal, conforme você indicou que "no laudo/relatório de ensaio diz o número da nota fiscal" e a planilha é preenchida por isso.
- SUPOSIÇÃO: assumi que "a planilha preenchida automaticamente" significa que o registro estruturado dentro da própria plataforma substitui o Excel atual, com possibilidade de exportação.
- SUPOSIÇÃO: assumi que a foto que "preenche automaticamente as informações" refere-se principalmente à nota fiscal (número da NF) e a laudos, já que são os documentos com dados textuais claros mencionados.
- SUPOSIÇÃO: assumi que não há, neste primeiro momento, um perfil de cliente externo consultando laudos, pois você não citou esse papel nas respostas — apenas técnicos de campo e gestor de produção.
- SUPOSIÇÃO: assumi que não há integração com ERP ou sistema de gestão de obras neste momento, já que você indicou que a rastreabilidade hoje é feita apenas em Excel e os laudos chegam em PDF.
