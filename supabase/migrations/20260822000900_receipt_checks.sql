-- =========================================================
-- RastreConcreto - conferencia do recebimento
--
-- O recebimento deixa de ser digitacao e vira conferencia: a leitura
-- automatica da nota preenche numero da NF, placa do caminhao, fck e volume,
-- e o tecnico marca "conferido" em cada um. A conferencia da placa e a que
-- mais importa na portaria — e preciso bater o caminhao que chegou com o
-- caminhao que esta escrito na nota.
--
-- Sao colunas explicitas (e nao um jsonb) porque a lista e fixa e o gestor
-- precisa filtrar "recebimentos sem conferencia completa" no relatorio.
-- =========================================================

alter table public.truck_receipts
  add column if not exists checked_invoice_number boolean not null default false,
  add column if not exists checked_truck_number   boolean not null default false,
  add column if not exists checked_fck            boolean not null default false,
  add column if not exists checked_volume         boolean not null default false,
  add column if not exists checked_by uuid references public.profiles(id) on delete set null,
  add column if not exists checked_at timestamptz;

comment on column public.truck_receipts.checked_truck_number is
  'Tecnico confirmou que a placa do caminhao que chegou e a mesma da nota fiscal.';

-- Conferencia completa: os quatro itens marcados. Coluna gerada para o
-- relatorio nao precisar repetir a regra.
alter table public.truck_receipts
  add column if not exists fully_checked boolean
    generated always as (
      checked_invoice_number and checked_truck_number
      and checked_fck and checked_volume
    ) stored;

create index if not exists idx_truck_receipts_fully_checked
  on public.truck_receipts (fully_checked)
  where fully_checked = false;

-- Carimba quem conferiu, sem depender do app lembrar de mandar.
create or replace function public.stamp_receipt_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.checked_invoice_number or new.checked_truck_number
      or new.checked_fck or new.checked_volume)
     and new.checked_at is null then
    new.checked_by := coalesce(new.checked_by, auth.uid());
    new.checked_at := now();
  end if;

  -- Desmarcou tudo: a conferencia deixa de existir.
  if not (new.checked_invoice_number or new.checked_truck_number
          or new.checked_fck or new.checked_volume) then
    new.checked_by := null;
    new.checked_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_stamp_receipt_check on public.truck_receipts;
create trigger trg_stamp_receipt_check
  before insert or update of checked_invoice_number, checked_truck_number,
                             checked_fck, checked_volume
  on public.truck_receipts
  for each row execute function public.stamp_receipt_check();

-- ---------------------------------------------------------
-- O fck exigido do recebimento vem da peca estrutural da concretagem, e nao
-- de um cadastro de tracos. A view entrega os dois lado a lado para a tela
-- de conferencia mostrar "exigido x nota".
-- ---------------------------------------------------------
create or replace view public.receipt_check_view
with (security_invoker = true) as
select
  t.id                       as truck_receipt_id,
  t.concreting_id,
  c.site_id,
  c.concreting_date,
  e.id                       as structural_element_id,
  e.name                     as structural_element_name,
  e.fck_required             as required_fck,   -- exigido pelo projeto
  e.slump_target             as target_slump,
  t.fck_required             as invoice_fck,    -- lido na nota fiscal
  t.slump_value,
  t.invoice_number,
  t.truck_number,
  t.volume_m3,
  t.ocr_status,
  t.checked_invoice_number,
  t.checked_truck_number,
  t.checked_fck,
  t.checked_volume,
  t.fully_checked,
  t.checked_at,
  -- Divergencia de fck entre projeto e nota: o alerta que a conferencia existe
  -- para pegar antes do caminhao descarregar.
  case when e.fck_required is null then null
       else t.fck_required < e.fck_required end as fck_below_required
from public.truck_receipts t
join public.concretings c on c.id = t.concreting_id
left join public.structural_elements e on e.id = c.structural_element_id;
