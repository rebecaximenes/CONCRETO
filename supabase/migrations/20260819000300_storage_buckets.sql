-- =========================================================
-- RastreConcreto - Fase 1
-- Buckets privados de Storage + policies por obra.
-- Rodar DEPOIS de db/schemas.sql (usa os helpers is_site_member /
-- is_production_manager).
--
-- CONVENCAO DE CAMINHO (obrigatoria em todo upload):
--   <site_id>/<resto-do-caminho>
-- A primeira pasta do objeto e o uuid da obra — e por ela que as policies
-- decidem quem le e quem escreve. Ex.:
--   invoice-photos/8f1c.../2026-08-19/nf-45231.jpg
--   placement-photos/8f1c.../<placement_record_id>/foto-1.jpg
--   test-reports/8f1c.../laudo-45231.pdf
-- =========================================================

insert into storage.buckets (id, name, public)
values
  ('invoice-photos', 'invoice-photos', false),
  ('placement-photos', 'placement-photos', false),
  ('test-reports', 'test-reports', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------
-- invoice-photos: fotos da nota fiscal tiradas no recebimento.
-- Leitura e upload por qualquer membro da obra (tecnico de recebimento).
-- ---------------------------------------------------------
drop policy if exists invoice_photos_select on storage.objects;
create policy invoice_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'invoice-photos'
    and public.is_site_member(
      case
        when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[1])::uuid
      end
    )
  );

drop policy if exists invoice_photos_insert on storage.objects;
create policy invoice_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'invoice-photos'
    and public.is_site_member(
      case
        when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[1])::uuid
      end
    )
  );

drop policy if exists invoice_photos_update on storage.objects;
create policy invoice_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'invoice-photos' and owner = auth.uid())
  with check (bucket_id = 'invoice-photos' and owner = auth.uid());

drop policy if exists invoice_photos_delete on storage.objects;
create policy invoice_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'invoice-photos'
    and (
      owner = auth.uid()
      or public.is_production_manager(
        case
          when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then ((storage.foldername(name))[1])::uuid
        end
      )
    )
  );

-- ---------------------------------------------------------
-- placement-photos: fotos do lancamento na laje.
-- ---------------------------------------------------------
drop policy if exists placement_photos_select on storage.objects;
create policy placement_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'placement-photos'
    and public.is_site_member(
      case
        when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[1])::uuid
      end
    )
  );

drop policy if exists placement_photos_insert on storage.objects;
create policy placement_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'placement-photos'
    and public.is_site_member(
      case
        when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[1])::uuid
      end
    )
  );

drop policy if exists placement_photos_update on storage.objects;
create policy placement_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'placement-photos' and owner = auth.uid())
  with check (bucket_id = 'placement-photos' and owner = auth.uid());

drop policy if exists placement_photos_delete on storage.objects;
create policy placement_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'placement-photos'
    and (
      owner = auth.uid()
      or public.is_production_manager(
        case
          when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then ((storage.foldername(name))[1])::uuid
        end
      )
    )
  );

-- ---------------------------------------------------------
-- test-reports: PDFs de laudo. Leitura por membros da obra; envio, troca e
-- exclusao apenas pelo gestor de producao daquela obra (docs/PROCESSO.md).
-- ---------------------------------------------------------
drop policy if exists test_reports_select on storage.objects;
create policy test_reports_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'test-reports'
    and public.is_site_member(
      case
        when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[1])::uuid
      end
    )
  );

drop policy if exists test_reports_insert on storage.objects;
create policy test_reports_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'test-reports'
    and public.is_production_manager(
      case
        when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[1])::uuid
      end
    )
  );

drop policy if exists test_reports_update on storage.objects;
create policy test_reports_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'test-reports'
    and public.is_production_manager(
      case
        when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[1])::uuid
      end
    )
  )
  with check (
    bucket_id = 'test-reports'
    and public.is_production_manager(
      case
        when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[1])::uuid
      end
    )
  );

drop policy if exists test_reports_delete on storage.objects;
create policy test_reports_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'test-reports'
    and public.is_production_manager(
      case
        when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then ((storage.foldername(name))[1])::uuid
      end
    )
  );
