-- =========================================================
-- RastreConcreto - Fase 2
-- Regras de negocio no banco: aprovacao da concretagem, pendencias de ensaio
-- e flag de conformidade. Ver docs/FUNCTIONS.md.
-- Rodar DEPOIS de db/schemas.sql.
-- =========================================================

-- ---------------------------------------------------------
-- create_pending_tests() — trigger AFTER INSERT em truck_receipts
-- Todo recebimento nasce devendo dois ensaios: 7 e 28 dias.
-- ---------------------------------------------------------
create or replace function public.create_pending_tests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_date date;
begin
  -- Data de referencia e a data da concretagem, nao a do insert: um registro
  -- feito offline pode chegar ao banco dias depois (docs/PROCESSO.md).
  select c.concreting_date into v_base_date
  from public.concretings c
  where c.id = new.concreting_id;

  v_base_date := coalesce(v_base_date, new.created_at::date, current_date);

  insert into public.pending_tests (truck_receipt_id, age_days, due_date, is_received)
  values
    (new.id, 7, v_base_date + 7, false),
    (new.id, 28, v_base_date + 28, false);

  return new;
end;
$$;

drop trigger if exists trg_truck_receipts_pending_tests on public.truck_receipts;

create trigger trg_truck_receipts_pending_tests
  after insert on public.truck_receipts
  for each row execute function public.create_pending_tests();

-- ---------------------------------------------------------
-- set_conformity_flag() — trigger BEFORE INSERT/UPDATE em strength_results
-- O alerta de nao conformidade nasce daqui: fck medido < fck exigido.
-- ---------------------------------------------------------
create or replace function public.set_conformity_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.is_conforming := (new.measured_fck >= new.required_fck);
  return new;
end;
$$;

drop trigger if exists trg_strength_results_conformity on public.strength_results;

create trigger trg_strength_results_conformity
  before insert or update on public.strength_results
  for each row execute function public.set_conformity_flag();

-- ---------------------------------------------------------
-- evaluate_conformity_result() — trigger AFTER INSERT em strength_results
--
-- Espelha em SQL o efeito da Edge Function `evaluate-conformity`: abre o
-- alerta quando o resultado esta abaixo do exigido e baixa a pendencia de
-- ensaio. Fica no banco porque nenhum resultado pode escapar do alerta —
-- venha ele da extracao por IA ou de digitacao manual do gestor. A Edge
-- Function continua responsavel pela notificacao por email (notify-manager).
-- Idempotente: nao duplica alerta para o mesmo strength_result.
-- ---------------------------------------------------------
create or replace function public.evaluate_conformity_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_id uuid;
  v_alert_id uuid;
begin
  select tr.site_id into v_site_id
  from public.test_reports tr
  where tr.id = new.test_report_id;

  -- Baixa a pendencia do marco correspondente (7 ou 28 dias).
  if new.truck_receipt_id is not null then
    update public.pending_tests
       set is_received = true,
           received_at = coalesce(received_at, now())
     where truck_receipt_id = new.truck_receipt_id
       and age_days = new.age_days
       and is_received = false;
  end if;

  if new.is_conforming then
    return new;
  end if;

  -- Nao conforme: abre o alerta (7 E 28 dias, conforme docs/PROCESSO.md).
  if exists (
    select 1 from public.nonconformity_alerts
    where strength_result_id = new.id
  ) then
    return new;
  end if;

  insert into public.nonconformity_alerts (
    site_id, strength_result_id, truck_receipt_id,
    age_days, measured_fck, required_fck, severity, status
  )
  values (
    v_site_id, new.id, new.truck_receipt_id,
    new.age_days, new.measured_fck, new.required_fck, 'high', 'open'
  )
  returning id into v_alert_id;

  insert into public.audit_log (actor_id, entity, entity_id, action, details)
  values (
    auth.uid(),
    'strength_results',
    new.id,
    'alert',
    jsonb_build_object(
      'nonconformity_alert_id', v_alert_id,
      'age_days', new.age_days,
      'measured_fck', new.measured_fck,
      'required_fck', new.required_fck
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_strength_results_evaluate on public.strength_results;

create trigger trg_strength_results_evaluate
  after insert on public.strength_results
  for each row execute function public.evaluate_conformity_result();

-- ---------------------------------------------------------
-- approve_concreting(concreting_id) — RPC chamado por /aprovacoes
--
-- So o gestor de producao aprova (docs/PROCESSO.md). Antes de aprovar, valida
-- a completude de TODOS os recebimentos: fck, nota fiscal, caminhao e slump —
-- e temperatura quando a peca e especial.
--
-- Os parametros p_approve/p_reason tem default: a chamada documentada
-- `approve_concreting(concreting_id)` continua valendo, e a rejeicao usa a
-- mesma funcao para cair no mesmo registro de auditoria.
-- ---------------------------------------------------------
create or replace function public.approve_concreting(
  concreting_id uuid,
  p_approve boolean default true,
  p_reason text default null
)
returns public.concretings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_concreting public.concretings;
  v_missing text[];
  v_receipt_count int;
begin
  select * into v_concreting
  from public.concretings c
  where c.id = approve_concreting.concreting_id;

  if v_concreting.id is null then
    raise exception 'Concretagem % nao encontrada.', approve_concreting.concreting_id
      using errcode = 'no_data_found';
  end if;

  if not public.is_production_manager(v_concreting.site_id) then
    raise exception 'Apenas o gestor de producao da obra pode aprovar ou rejeitar a concretagem.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_concreting.status = 'approved' then
    raise exception 'Concretagem ja aprovada em %.', v_concreting.approved_at
      using errcode = 'raise_exception';
  end if;

  if p_approve then
    select count(*) into v_receipt_count
    from public.truck_receipts t
    where t.concreting_id = v_concreting.id;

    if v_receipt_count = 0 then
      raise exception 'Concretagem sem nenhum recebimento de caminhao registrado.'
        using errcode = 'raise_exception';
    end if;

    -- Recebimento incompleto bloqueia a aprovacao (docs/PROCESSO.md).
    select array_agg(distinct campo) into v_missing
    from public.truck_receipts t
    cross join lateral (
      values
        (case when t.invoice_number is null or btrim(t.invoice_number) = '' then 'nota fiscal' end),
        (case when t.truck_number is null or btrim(t.truck_number) = '' then 'numero do caminhao' end),
        (case when t.slump_value is null then 'slump' end),
        (case when t.fck_required is null then 'fck do traco' end),
        (case when t.is_special_piece and t.temperature is null then 'temperatura (peca especial)' end)
    ) as faltando(campo)
    where t.concreting_id = v_concreting.id
      and campo is not null;

    if v_missing is not null and array_length(v_missing, 1) > 0 then
      raise exception 'Recebimento incompleto: falta %.', array_to_string(v_missing, ', ')
        using errcode = 'check_violation';
    end if;
  end if;

  update public.concretings
     set status = case when p_approve then 'approved' else 'rejected' end,
         approved_by = auth.uid(),
         approved_at = now()
   where id = v_concreting.id
  returning * into v_concreting;

  insert into public.audit_log (actor_id, entity, entity_id, action, details)
  values (
    auth.uid(),
    'concretings',
    v_concreting.id,
    case when p_approve then 'approve' else 'reject' end,
    jsonb_build_object('reason', p_reason, 'site_id', v_concreting.site_id)
  );

  return v_concreting;
end;
$$;

revoke all on function public.approve_concreting(uuid, boolean, text) from public;
grant execute on function public.approve_concreting(uuid, boolean, text) to authenticated;
