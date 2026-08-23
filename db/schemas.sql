-- =========================================================
-- RastreConcreto - schemas.sql
-- Backend: Supabase (PostgreSQL + RLS + Auth + Storage + Edge Functions)
-- Ordem: tabelas (por dependencia) -> indices -> helpers de RLS -> RLS -> policies
-- =========================================================

-- ---------------------------------------------------------
-- 1. Function + trigger de updated_at (reutilizada em todas as tabelas)
-- ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- 2. TABELAS
-- =========================================================

-- ---------------------------------------------------------
-- profiles
-- ---------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'field_tech'
    check (role in ('receiving_tech','slab_tech','field_tech','production_manager')),
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_role on public.profiles (role);
create index idx_profiles_email on public.profiles (email);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- sites
-- ---------------------------------------------------------
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  address text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sites_created_by on public.sites (created_by);
create index idx_sites_is_active on public.sites (is_active);

create trigger trg_sites_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- site_members
-- ---------------------------------------------------------
create table public.site_members (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  site_role text not null default 'field_tech',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_site_members_site on public.site_members (site_id);
create index idx_site_members_profile on public.site_members (profile_id);
create unique index uniq_site_members on public.site_members (site_id, profile_id);

create trigger trg_site_members_updated_at
  before update on public.site_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- concrete_mixes
-- ---------------------------------------------------------
create table public.concrete_mixes (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null,
  fck_required numeric(6,2) not null,
  supplier text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_concrete_mixes_site on public.concrete_mixes (site_id);

create trigger trg_concrete_mixes_updated_at
  before update on public.concrete_mixes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- concretings
-- ---------------------------------------------------------
create table public.concretings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  concreting_date date not null default current_date,
  title text,
  status text not null default 'in_progress'
    check (status in ('in_progress','pending_approval','approved','rejected')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  client_local_id text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_concretings_site on public.concretings (site_id);
create index idx_concretings_status on public.concretings (status);
create index idx_concretings_date on public.concretings (concreting_date desc);
create index idx_concretings_created_by on public.concretings (created_by);
create unique index uniq_concretings_client_local on public.concretings (created_by, client_local_id);

create trigger trg_concretings_updated_at
  before update on public.concretings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- truck_receipts
-- ---------------------------------------------------------
create table public.truck_receipts (
  id uuid primary key default gen_random_uuid(),
  concreting_id uuid not null references public.concretings(id) on delete cascade,
  invoice_number text not null,
  truck_number text not null,
  concrete_mix_id uuid references public.concrete_mixes(id) on delete set null,
  fck_required numeric(6,2) not null,
  slump_value numeric(5,1) not null,
  temperature numeric(5,1),
  is_special_piece boolean not null default false,
  invoice_photo_path text,
  ocr_status text not null default 'pending'
    check (ocr_status in ('pending','processing','done','failed')),
  received_by uuid not null references public.profiles(id) on delete restrict,
  client_local_id text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_truck_receipts_concreting on public.truck_receipts (concreting_id);
create index idx_truck_receipts_invoice on public.truck_receipts (invoice_number);
create index idx_truck_receipts_mix on public.truck_receipts (concrete_mix_id);
create index idx_truck_receipts_received_by on public.truck_receipts (received_by);
create unique index uniq_truck_receipts_client_local on public.truck_receipts (received_by, client_local_id);

create trigger trg_truck_receipts_updated_at
  before update on public.truck_receipts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- placement_records
-- ---------------------------------------------------------
create table public.placement_records (
  id uuid primary key default gen_random_uuid(),
  concreting_id uuid not null references public.concretings(id) on delete cascade,
  truck_receipt_id uuid references public.truck_receipts(id) on delete set null,
  responsible_tech_id uuid not null references public.profiles(id) on delete restrict,
  placed_at timestamptz not null default now(),
  notes text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  client_local_id text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_placement_records_concreting on public.placement_records (concreting_id);
create index idx_placement_records_receipt on public.placement_records (truck_receipt_id);
create index idx_placement_records_responsible on public.placement_records (responsible_tech_id);
create unique index uniq_placement_client_local on public.placement_records (recorded_by, client_local_id);

create trigger trg_placement_records_updated_at
  before update on public.placement_records
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- placement_photos
-- ---------------------------------------------------------
create table public.placement_photos (
  id uuid primary key default gen_random_uuid(),
  placement_record_id uuid not null references public.placement_records(id) on delete cascade,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_placement_photos_record on public.placement_photos (placement_record_id);

create trigger trg_placement_photos_updated_at
  before update on public.placement_photos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- test_reports
-- ---------------------------------------------------------
create table public.test_reports (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  storage_path text not null,
  invoice_number text,
  matched_truck_receipt_id uuid references public.truck_receipts(id) on delete set null,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending','processing','done','needs_review','failed')),
  raw_extraction jsonb,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_test_reports_site on public.test_reports (site_id);
create index idx_test_reports_invoice on public.test_reports (invoice_number);
create index idx_test_reports_receipt on public.test_reports (matched_truck_receipt_id);
create index idx_test_reports_status on public.test_reports (extraction_status);

create trigger trg_test_reports_updated_at
  before update on public.test_reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- strength_results
-- ---------------------------------------------------------
create table public.strength_results (
  id uuid primary key default gen_random_uuid(),
  test_report_id uuid not null references public.test_reports(id) on delete cascade,
  truck_receipt_id uuid references public.truck_receipts(id) on delete set null,
  age_days int not null check (age_days in (7,28)),
  measured_fck numeric(6,2) not null,
  required_fck numeric(6,2) not null,
  is_conforming boolean not null,
  test_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_strength_results_report on public.strength_results (test_report_id);
create index idx_strength_results_receipt on public.strength_results (truck_receipt_id);
create index idx_strength_results_conforming on public.strength_results (is_conforming);
create index idx_strength_results_age on public.strength_results (age_days);

create trigger trg_strength_results_updated_at
  before update on public.strength_results
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- nonconformity_alerts
-- ---------------------------------------------------------
create table public.nonconformity_alerts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  strength_result_id uuid not null references public.strength_results(id) on delete cascade,
  truck_receipt_id uuid references public.truck_receipts(id) on delete set null,
  age_days int not null,
  measured_fck numeric(6,2) not null,
  required_fck numeric(6,2) not null,
  severity text not null default 'high',
  status text not null default 'open'
    check (status in ('open','acknowledged','resolved')),
  acknowledged_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_nc_alerts_site on public.nonconformity_alerts (site_id);
create index idx_nc_alerts_status on public.nonconformity_alerts (status);
create index idx_nc_alerts_result on public.nonconformity_alerts (strength_result_id);

create trigger trg_nc_alerts_updated_at
  before update on public.nonconformity_alerts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- pending_tests
-- ---------------------------------------------------------
create table public.pending_tests (
  id uuid primary key default gen_random_uuid(),
  truck_receipt_id uuid not null references public.truck_receipts(id) on delete cascade,
  age_days int not null check (age_days in (7,28)),
  due_date date not null,
  is_received boolean not null default false,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pending_tests_receipt on public.pending_tests (truck_receipt_id);
create index idx_pending_tests_due on public.pending_tests (due_date);
create index idx_pending_tests_open on public.pending_tests (is_received) where is_received = false;

create trigger trg_pending_tests_updated_at
  before update on public.pending_tests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  entity text not null,
  entity_id uuid not null,
  action text not null check (action in ('approve','reject','update','alert')),
  details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_audit_entity on public.audit_log (entity, entity_id);
create index idx_audit_actor on public.audit_log (actor_id);

create trigger trg_audit_log_updated_at
  before update on public.audit_log
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Helpers de RLS (SECURITY DEFINER)
-- Definidos DEPOIS das tabelas: sao functions `language sql`, cujo corpo o
-- PostgreSQL valida ja na criacao — declaradas antes de profiles/site_members
-- o script falha com "relation does not exist" num banco novo.
-- ---------------------------------------------------------
create or replace function public.is_site_member(p_site_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.site_members sm
    join public.profiles p on p.id = sm.profile_id
    where sm.site_id = p_site_id
      and sm.profile_id = auth.uid()
  );
$$;

create or replace function public.is_production_manager(p_site_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.site_members sm
    where sm.site_id = p_site_id
      and sm.profile_id = auth.uid()
      and sm.site_role = 'production_manager'
  )
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'production_manager'
  );
$$;

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- =========================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- =========================================================
alter table public.profiles enable row level security;
alter table public.sites enable row level security;
alter table public.site_members enable row level security;
alter table public.concrete_mixes enable row level security;
alter table public.concretings enable row level security;
alter table public.truck_receipts enable row level security;
alter table public.placement_records enable row level security;
alter table public.placement_photos enable row level security;
alter table public.test_reports enable row level security;
alter table public.strength_results enable row level security;
alter table public.nonconformity_alerts enable row level security;
alter table public.pending_tests enable row level security;
alter table public.audit_log enable row level security;

-- =========================================================
-- 4. POLICIES
-- =========================================================

-- ---------------- profiles ----------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.site_members sm_self
      join public.site_members sm_other on sm_other.site_id = sm_self.site_id
      where sm_self.profile_id = auth.uid()
        and sm_self.site_role = 'production_manager'
        and sm_other.profile_id = public.profiles.id
    )
  );

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.current_profile_role() = 'production_manager')
  with check (id = auth.uid() or public.current_profile_role() = 'production_manager');

-- DELETE: nenhuma policy (desativar via is_active)

-- ---------------- sites ----------------
create policy sites_select on public.sites
  for select to authenticated
  using (public.is_site_member(id));

create policy sites_insert on public.sites
  for insert to authenticated
  with check (public.current_profile_role() = 'production_manager');

create policy sites_update on public.sites
  for update to authenticated
  using (public.is_production_manager(id))
  with check (public.is_production_manager(id));

-- DELETE: nenhuma policy (usar is_active)

-- ---------------- site_members ----------------
create policy site_members_select on public.site_members
  for select to authenticated
  using (public.is_site_member(site_id));

create policy site_members_insert on public.site_members
  for insert to authenticated
  with check (public.is_production_manager(site_id));

create policy site_members_update on public.site_members
  for update to authenticated
  using (public.is_production_manager(site_id))
  with check (public.is_production_manager(site_id));

create policy site_members_delete on public.site_members
  for delete to authenticated
  using (public.is_production_manager(site_id));

-- ---------------- concrete_mixes ----------------
create policy concrete_mixes_select on public.concrete_mixes
  for select to authenticated
  using (public.is_site_member(site_id));

create policy concrete_mixes_insert on public.concrete_mixes
  for insert to authenticated
  with check (public.is_production_manager(site_id));

create policy concrete_mixes_update on public.concrete_mixes
  for update to authenticated
  using (public.is_production_manager(site_id))
  with check (public.is_production_manager(site_id));

create policy concrete_mixes_delete on public.concrete_mixes
  for delete to authenticated
  using (public.is_production_manager(site_id));

-- ---------------- concretings ----------------
create policy concretings_select on public.concretings
  for select to authenticated
  using (public.is_site_member(site_id));

create policy concretings_insert on public.concretings
  for insert to authenticated
  with check (public.is_site_member(site_id) and created_by = auth.uid());

create policy concretings_update on public.concretings
  for update to authenticated
  using (
    (created_by = auth.uid() and status = 'in_progress')
    or public.is_production_manager(site_id)
  )
  with check (public.is_site_member(site_id));

create policy concretings_delete on public.concretings
  for delete to authenticated
  using (public.is_production_manager(site_id));

-- ---------------- truck_receipts ----------------
create policy truck_receipts_select on public.truck_receipts
  for select to authenticated
  using (
    exists (
      select 1 from public.concretings c
      where c.id = concreting_id and public.is_site_member(c.site_id)
    )
  );

create policy truck_receipts_insert on public.truck_receipts
  for insert to authenticated
  with check (
    received_by = auth.uid()
    and exists (
      select 1 from public.concretings c
      where c.id = concreting_id and public.is_site_member(c.site_id)
    )
  );

create policy truck_receipts_update on public.truck_receipts
  for update to authenticated
  using (
    received_by = auth.uid()
    and exists (
      select 1 from public.concretings c
      where c.id = concreting_id and c.status <> 'approved'
    )
  )
  with check (received_by = auth.uid());

create policy truck_receipts_delete on public.truck_receipts
  for delete to authenticated
  using (
    exists (
      select 1 from public.concretings c
      where c.id = concreting_id and public.is_production_manager(c.site_id)
    )
  );

-- ---------------- placement_records ----------------
create policy placement_records_select on public.placement_records
  for select to authenticated
  using (
    exists (
      select 1 from public.concretings c
      where c.id = concreting_id and public.is_site_member(c.site_id)
    )
  );

create policy placement_records_insert on public.placement_records
  for insert to authenticated
  with check (
    recorded_by = auth.uid()
    and exists (
      select 1 from public.concretings c
      where c.id = concreting_id and public.is_site_member(c.site_id)
    )
  );

create policy placement_records_update on public.placement_records
  for update to authenticated
  using (
    recorded_by = auth.uid()
    and exists (
      select 1 from public.concretings c
      where c.id = concreting_id and c.status <> 'approved'
    )
  )
  with check (recorded_by = auth.uid());

create policy placement_records_delete on public.placement_records
  for delete to authenticated
  using (
    recorded_by = auth.uid()
    or exists (
      select 1 from public.concretings c
      where c.id = concreting_id and public.is_production_manager(c.site_id)
    )
  );

-- ---------------- placement_photos ----------------
create policy placement_photos_select on public.placement_photos
  for select to authenticated
  using (
    exists (
      select 1 from public.placement_records pr
      join public.concretings c on c.id = pr.concreting_id
      where pr.id = placement_record_id and public.is_site_member(c.site_id)
    )
  );

create policy placement_photos_insert on public.placement_photos
  for insert to authenticated
  with check (
    exists (
      select 1 from public.placement_records pr
      join public.concretings c on c.id = pr.concreting_id
      where pr.id = placement_record_id and public.is_site_member(c.site_id)
    )
  );

create policy placement_photos_update on public.placement_photos
  for update to authenticated
  using (
    exists (
      select 1 from public.placement_records pr
      where pr.id = placement_record_id and pr.recorded_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.placement_records pr
      where pr.id = placement_record_id and pr.recorded_by = auth.uid()
    )
  );

create policy placement_photos_delete on public.placement_photos
  for delete to authenticated
  using (
    exists (
      select 1 from public.placement_records pr
      join public.concretings c on c.id = pr.concreting_id
      where pr.id = placement_record_id
        and (pr.recorded_by = auth.uid() or public.is_production_manager(c.site_id))
    )
  );

-- ---------------- test_reports ----------------
create policy test_reports_select on public.test_reports
  for select to authenticated
  using (public.is_site_member(site_id));

create policy test_reports_insert on public.test_reports
  for insert to authenticated
  with check (public.is_production_manager(site_id) and uploaded_by = auth.uid());

create policy test_reports_update on public.test_reports
  for update to authenticated
  using (public.is_production_manager(site_id))
  with check (public.is_production_manager(site_id));

create policy test_reports_delete on public.test_reports
  for delete to authenticated
  using (public.is_production_manager(site_id));

-- ---------------- strength_results ----------------
create policy strength_results_select on public.strength_results
  for select to authenticated
  using (
    exists (
      select 1 from public.test_reports tr
      where tr.id = test_report_id and public.is_site_member(tr.site_id)
    )
  );

create policy strength_results_insert on public.strength_results
  for insert to authenticated
  with check (
    exists (
      select 1 from public.test_reports tr
      where tr.id = test_report_id and public.is_production_manager(tr.site_id)
    )
  );

create policy strength_results_update on public.strength_results
  for update to authenticated
  using (
    exists (
      select 1 from public.test_reports tr
      where tr.id = test_report_id and public.is_production_manager(tr.site_id)
    )
  )
  with check (
    exists (
      select 1 from public.test_reports tr
      where tr.id = test_report_id and public.is_production_manager(tr.site_id)
    )
  );

create policy strength_results_delete on public.strength_results
  for delete to authenticated
  using (
    exists (
      select 1 from public.test_reports tr
      where tr.id = test_report_id and public.is_production_manager(tr.site_id)
    )
  );

-- ---------------- nonconformity_alerts ----------------
create policy nc_alerts_select on public.nonconformity_alerts
  for select to authenticated
  using (public.is_site_member(site_id));

create policy nc_alerts_update on public.nonconformity_alerts
  for update to authenticated
  using (public.is_production_manager(site_id))
  with check (public.is_production_manager(site_id));

-- INSERT: apenas service role (Edge Function / trigger). DELETE: nenhum.

-- ---------------- pending_tests ----------------
create policy pending_tests_select on public.pending_tests
  for select to authenticated
  using (
    exists (
      select 1 from public.truck_receipts trk
      join public.concretings c on c.id = trk.concreting_id
      where trk.id = truck_receipt_id and public.is_site_member(c.site_id)
    )
  );

create policy pending_tests_delete on public.pending_tests
  for delete to authenticated
  using (
    exists (
      select 1 from public.truck_receipts trk
      join public.concretings c on c.id = trk.concreting_id
      where trk.id = truck_receipt_id and public.is_production_manager(c.site_id)
    )
  );

-- INSERT/UPDATE: apenas service role (Edge Function / cron).

-- ---------------- audit_log ----------------
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.current_profile_role() = 'production_manager');

-- INSERT: service role/triggers. UPDATE/DELETE: nenhum.
