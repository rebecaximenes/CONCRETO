-- =========================================================
-- RastreConcreto - Horarios da entrega do caminhao
--
-- Os quatro marcos que a obra acompanha (definidos pela gestao, espelhando o
-- portal da concreteira — TOPCON/Lemix):
--   1. emissao da nota fiscal  = saida da central
--   2. chegada na obra
--   3. inicio da descarga
--   4. fim da descarga         = inicio da descarga do CAMINHAO SEGUINTE
--
-- O marco 4 nao e digitado: sai da regra acima, calculada pelo banco.
-- Rodar DEPOIS de db/schemas.sql.
-- =========================================================

alter table public.truck_receipts
  add column if not exists invoice_issued_at timestamptz,
  add column if not exists site_arrival_at timestamptz,
  add column if not exists discharge_start_at timestamptz,
  add column if not exists discharge_end_at timestamptz,
  -- Numero da remessa no portal da concreteira: chave para o preenchimento
  -- automatico casar a entrega com este recebimento.
  add column if not exists supplier_delivery_code text;

comment on column public.truck_receipts.invoice_issued_at is
  'Emissao da nota fiscal — saida do caminhao da central.';
comment on column public.truck_receipts.site_arrival_at is
  'Chegada do caminhao na obra.';
comment on column public.truck_receipts.discharge_start_at is
  'Inicio da descarga do concreto.';
comment on column public.truck_receipts.discharge_end_at is
  'Fim da descarga: calculado como o inicio da descarga do caminhao seguinte da mesma concretagem.';
-- Reservado para a integracao com o portal da concreteira, que ainda nao
-- existe. Fica fora da tela ate la: o numero da nota de remessa ja e o
-- primeiro campo da conferencia, e dois campos de "remessa" confundem quem
-- recebe o caminhao.
comment on column public.truck_receipts.supplier_delivery_code is
  'Numero da remessa no sistema da concreteira, usado para casar a entrega.';

create index if not exists idx_truck_receipts_supplier_delivery
  on public.truck_receipts (supplier_delivery_code);
create index if not exists idx_truck_receipts_discharge_start
  on public.truck_receipts (concreting_id, discharge_start_at);

-- ---------------------------------------------------------
-- recompute_discharge_windows() — aplica a regra do fim da descarga.
--
-- Para cada concretagem, o fim da descarga de um caminhao e o inicio da
-- descarga do proximo. O ultimo caminhao fica sem fim (nao ha proximo) — nesse
-- caso o valor digitado a mao e preservado.
-- ---------------------------------------------------------
create or replace function public.recompute_discharge_windows(p_concreting_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  with ordered as (
    select id,
           lead(discharge_start_at) over (
             partition by concreting_id order by discharge_start_at
           ) as next_start
      from public.truck_receipts
     where concreting_id = p_concreting_id
       and discharge_start_at is not null
  )
  update public.truck_receipts t
     set discharge_end_at = o.next_start
    from ordered o
   where t.id = o.id
     and o.next_start is not null
     and t.discharge_end_at is distinct from o.next_start;
$$;

-- ---------------------------------------------------------
-- Trigger: recalcula a janela sempre que um inicio de descarga entra, muda ou
-- some. Declarado `of discharge_start_at` de proposito — o recalculo mexe so
-- em discharge_end_at, entao nao dispara a si mesmo.
-- ---------------------------------------------------------
create or replace function public.trg_recompute_discharge_windows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_discharge_windows(
    coalesce(new.concreting_id, old.concreting_id)
  );
  return null;
end;
$$;

drop trigger if exists trg_truck_receipts_discharge_window on public.truck_receipts;

create trigger trg_truck_receipts_discharge_window
  after insert or delete or update of discharge_start_at on public.truck_receipts
  for each row execute function public.trg_recompute_discharge_windows();
