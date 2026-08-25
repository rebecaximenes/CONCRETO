-- =========================================================
-- RastreConcreto - volume por dia, para o previsto x realizado no tempo
--
-- A aba ACOMPANHAMENTO da planilha so mostra o TOTAL aplicado ate hoje. Ela
-- responde "estourou?" mas nao responde "quando comecou a estourar?" — e essa
-- e a pergunta que muda a decisao em obra, porque so da para agir antes do
-- fim se der para ver a curva subindo.
--
-- Esta view entrega uma linha por dia de concretagem de cada peca. O acumulado
-- e a curva ficam por conta de quem consulta: e uma soma corrida, barata no
-- cliente, e assim a mesma view serve para a curva e para a tabela do dia.
--
-- security_invoker: quem nao e membro da obra nao ve nada, como nas demais.
-- =========================================================

create or replace view public.element_daily_volume
with (security_invoker = true) as
select
  c.structural_element_id,
  c.site_id,
  c.concreting_date,
  -- Um dia pode ter mais de uma concretagem na mesma peca (manha e tarde).
  count(distinct c.id)                         as concretings_count,
  count(t.id)                                  as trucks_count,
  coalesce(sum(t.volume_m3), 0)::numeric(12,4) as volume_m3
from public.concretings c
join public.truck_receipts t on t.concreting_id = c.id
where c.structural_element_id is not null
  and t.volume_m3 is not null
group by c.structural_element_id, c.site_id, c.concreting_date;

comment on view public.element_daily_volume is
  'Volume de concreto aplicado por dia em cada peca estrutural. O acumulado e a '
  'perda no tempo saem daqui, somando os dias em ordem.';
