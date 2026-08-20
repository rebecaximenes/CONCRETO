-- =========================================================
-- RastreConcreto - Fase 3
-- cron-check-overdue-tests: varre as pendencias de ensaio vencidas e avisa o
-- gestor. Ver docs/FUNCTIONS.md.
--
-- ANTES DE RODAR, configure as duas chaves abaixo no banco (uma vez, com o
-- projeto ja criado). Sem elas a funcao apenas registra e nao envia nada:
--
--   alter database postgres set app.edge_functions_url =
--     'https://<seu-project-ref>.supabase.co/functions/v1';
--   alter database postgres set app.service_role_key = '<sua service role key>';
--
-- A service role key fica no banco, nunca no frontend.
-- =========================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------
-- check_overdue_tests() — corpo do job diario.
-- Junta as pendencias vencidas por obra e dispara uma notificacao por obra,
-- em vez de uma por corpo de prova: o gestor recebe um aviso, nao vinte.
-- ---------------------------------------------------------
create or replace function public.check_overdue_tests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := current_setting('app.edge_functions_url', true);
  v_key text := current_setting('app.service_role_key', true);
  v_site record;
  v_count integer := 0;
begin
  for v_site in
    select c.site_id,
           count(*) as overdue_count,
           min(pt.due_date) as oldest_due,
           array_agg(distinct trk.invoice_number) as invoices
      from public.pending_tests pt
      join public.truck_receipts trk on trk.id = pt.truck_receipt_id
      join public.concretings c on c.id = trk.concreting_id
     where pt.is_received = false
       and pt.due_date < current_date
     group by c.site_id
  loop
    v_count := v_count + 1;

    -- Auditoria primeiro: mesmo sem pg_net configurado fica o registro de que
    -- a obra tem ensaio vencido.
    insert into public.audit_log (entity, entity_id, action, details)
    values (
      'pending_tests',
      v_site.site_id,
      'alert',
      jsonb_build_object(
        'event_type', 'overdue_test',
        'overdue_count', v_site.overdue_count,
        'oldest_due_date', v_site.oldest_due,
        'invoice_numbers', v_site.invoices
      )
    );

    if v_url is not null and v_key is not null then
      perform net.http_post(
        url := v_url || '/notify-manager',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_key
        ),
        body := jsonb_build_object(
          'event_type', 'overdue_test',
          'site_id', v_site.site_id,
          'context', jsonb_build_object(
            'overdue_count', v_site.overdue_count,
            'oldest_due_date', v_site.oldest_due
          )
        )
      );
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.check_overdue_tests() from public;

-- ---------------------------------------------------------
-- Agendamento diario as 08:00 UTC (manha no horario de Brasilia).
-- ---------------------------------------------------------
select cron.unschedule('cron-check-overdue-tests')
where exists (
  select 1 from cron.job where jobname = 'cron-check-overdue-tests'
);

select cron.schedule(
  'cron-check-overdue-tests',
  '0 8 * * *',
  $cron$ select public.check_overdue_tests(); $cron$
);
