-- =========================================================
-- RastreConcreto - a peca com historico nao pode ser apagada
--
-- Antes o vinculo era `on delete set null`: apagar uma peca desligava em
-- silencio todas as concretagens dela, e o previsto x realizado daquela peca
-- sumia sem aviso. Agora o banco recusa, e a tela explica o motivo.
-- =========================================================

alter table public.concretings
  drop constraint if exists concretings_structural_element_id_fkey;

alter table public.concretings
  add constraint concretings_structural_element_id_fkey
  foreign key (structural_element_id)
  references public.structural_elements(id) on delete restrict;
