/**
 * Tipos do banco do RastreConcreto.
 *
 * Espelham `db/schemas.sql` (fonte unica do modelo de dados). Ao alterar o
 * schema, rode a migracao e atualize este arquivo — os nomes de tabela e
 * coluna devem continuar identicos aos de `docs/DEPARA.md`.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProfileRole =
  | "receiving_tech"
  | "slab_tech"
  | "field_tech"
  | "production_manager";

export type ConcretingStatus =
  | "in_progress"
  | "pending_approval"
  | "approved"
  | "rejected";

export type OcrStatus = "pending" | "processing" | "done" | "failed";

export type ExtractionStatus =
  | "pending"
  | "processing"
  | "done"
  | "needs_review"
  | "failed";

export type AlertStatus = "open" | "acknowledged" | "resolved";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          role: ProfileRole;
          phone: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          email: string;
          role?: ProfileRole;
          phone?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      sites: {
        Row: {
          id: string;
          name: string;
          code: string | null;
          address: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code?: string | null;
          address?: string | null;
          is_active?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sites"]["Insert"]>;
        Relationships: [];
      };
      site_members: {
        Row: {
          id: string;
          site_id: string;
          profile_id: string;
          site_role: ProfileRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          profile_id: string;
          site_role?: ProfileRole;
        };
        Update: Partial<Database["public"]["Tables"]["site_members"]["Insert"]>;
        Relationships: [];
      };
      concrete_mixes: {
        Row: {
          id: string;
          site_id: string;
          name: string;
          fck_required: number;
          supplier: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          fck_required: number;
          supplier?: string | null;
          notes?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["concrete_mixes"]["Insert"]
        >;
        Relationships: [];
      };
      pieces: {
        Row: {
          id: string;
          site_id: string;
          name: string;
          fck_required: number;
          is_special: boolean;
          location_description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          fck_required: number;
          is_special?: boolean;
          location_description?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["pieces"]["Insert"]>;
        Relationships: [];
      };
      concretings: {
        Row: {
          id: string;
          site_id: string;
          concreting_date: string;
          title: string | null;
          status: ConcretingStatus;
          approved_by: string | null;
          approved_at: string | null;
          created_by: string;
          client_local_id: string | null;
          synced_at: string | null;
          /** Peça estrutural que esta concretagem está executando. */
          structural_element_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          concreting_date?: string;
          title?: string | null;
          status?: ConcretingStatus;
          created_by: string;
          client_local_id?: string | null;
          synced_at?: string | null;
          structural_element_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["concretings"]["Insert"]> & {
          status?: ConcretingStatus;
          approved_by?: string | null;
          approved_at?: string | null;
        };
        Relationships: [];
      };
      truck_receipts: {
        Row: {
          id: string;
          concreting_id: string;
          invoice_number: string;
          truck_number: string;
          concrete_mix_id: string | null;
          fck_required: number;
          slump_value: number;
          temperature: number | null;
          is_special_piece: boolean;
          invoice_photo_path: string | null;
          ocr_status: OcrStatus;
          received_by: string;
          client_local_id: string | null;
          synced_at: string | null;
          /** Emissão da NF = saída da central. */
          invoice_issued_at: string | null;
          site_arrival_at: string | null;
          discharge_start_at: string | null;
          /** Calculado pelo banco: início da descarga do caminhão seguinte. */
          discharge_end_at: string | null;
          /** Número da remessa no portal da concreteira. */
          supplier_delivery_code: string | null;
          /** Volume entregue por este caminhão, conforme a nota fiscal. */
          volume_m3: number | null;
          /** Cor da área marcada na planta para este caminhão (#RRGGBB). */
          marking_color: string | null;
          checked_invoice_number: boolean;
          checked_truck_number: boolean;
          checked_fck: boolean;
          checked_volume: boolean;
          /** Calculada pelo banco a partir dos quatro acima: nunca enviar. */
          fully_checked: boolean;
          /** Carimbados por trigger quando a conferência começa: nunca enviar. */
          checked_by: string | null;
          checked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          concreting_id: string;
          invoice_number: string;
          truck_number: string;
          concrete_mix_id?: string | null;
          fck_required: number;
          slump_value: number;
          temperature?: number | null;
          is_special_piece?: boolean;
          invoice_photo_path?: string | null;
          ocr_status?: OcrStatus;
          received_by: string;
          client_local_id?: string | null;
          synced_at?: string | null;
          invoice_issued_at?: string | null;
          site_arrival_at?: string | null;
          discharge_start_at?: string | null;
          discharge_end_at?: string | null;
          supplier_delivery_code?: string | null;
          volume_m3?: number | null;
          marking_color?: string | null;
          checked_invoice_number?: boolean;
          checked_truck_number?: boolean;
          checked_fck?: boolean;
          checked_volume?: boolean;
        };
        Update: Partial<
          Database["public"]["Tables"]["truck_receipts"]["Insert"]
        >;
        Relationships: [];
      };
      placement_records: {
        Row: {
          id: string;
          concreting_id: string;
          piece_id: string;
          truck_receipt_id: string | null;
          responsible_tech_id: string;
          placed_at: string;
          notes: string | null;
          recorded_by: string;
          client_local_id: string | null;
          synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          concreting_id: string;
          piece_id: string;
          truck_receipt_id?: string | null;
          responsible_tech_id: string;
          placed_at?: string;
          notes?: string | null;
          recorded_by: string;
          client_local_id?: string | null;
          synced_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["placement_records"]["Insert"]
        >;
        Relationships: [];
      };
      placement_photos: {
        Row: {
          id: string;
          placement_record_id: string;
          storage_path: string;
          caption: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          placement_record_id: string;
          storage_path: string;
          caption?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["placement_photos"]["Insert"]
        >;
        Relationships: [];
      };
      test_reports: {
        Row: {
          id: string;
          site_id: string;
          storage_path: string;
          invoice_number: string | null;
          matched_truck_receipt_id: string | null;
          extraction_status: ExtractionStatus;
          raw_extraction: Json | null;
          uploaded_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          storage_path: string;
          invoice_number?: string | null;
          matched_truck_receipt_id?: string | null;
          extraction_status?: ExtractionStatus;
          raw_extraction?: Json | null;
          uploaded_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["test_reports"]["Insert"]>;
        Relationships: [];
      };
      strength_results: {
        Row: {
          id: string;
          test_report_id: string;
          truck_receipt_id: string | null;
          piece_id: string | null;
          age_days: number;
          measured_fck: number;
          required_fck: number;
          is_conforming: boolean;
          test_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          test_report_id: string;
          truck_receipt_id?: string | null;
          piece_id?: string | null;
          age_days: number;
          measured_fck: number;
          required_fck: number;
          is_conforming: boolean;
          test_date?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["strength_results"]["Insert"]
        >;
        Relationships: [];
      };
      nonconformity_alerts: {
        Row: {
          id: string;
          site_id: string;
          strength_result_id: string;
          truck_receipt_id: string | null;
          age_days: number;
          measured_fck: number;
          required_fck: number;
          severity: string;
          status: AlertStatus;
          acknowledged_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          strength_result_id: string;
          truck_receipt_id?: string | null;
          age_days: number;
          measured_fck: number;
          required_fck: number;
          severity?: string;
          status?: AlertStatus;
          acknowledged_by?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["nonconformity_alerts"]["Insert"]
        >;
        Relationships: [];
      };
      pending_tests: {
        Row: {
          id: string;
          truck_receipt_id: string;
          age_days: number;
          due_date: string;
          is_received: boolean;
          received_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          truck_receipt_id: string;
          age_days: number;
          due_date: string;
          is_received?: boolean;
          received_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["pending_tests"]["Insert"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          actor_id: string | null;
          entity: string;
          entity_id: string;
          action: "approve" | "reject" | "update" | "alert";
          details: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          entity: string;
          entity_id: string;
          action: "approve" | "reject" | "update" | "alert";
          details?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
      structural_elements: {
        Row: {
          id: string;
          site_id: string;
          location: string;
          floor_level: string | null;
          name: string;
          concrete_spec: string | null;
          fck_required: number | null;
          slump_target: number | null;
          supplier: string | null;
          placement_method: "bombeado" | "convencional";
          drawing_sheet: string | null;
          drawing_revision: string | null;
          planned_volume_m3: number;
          waste_percent: number;
          /** Calculada pelo banco: round(previsto * perda% / 100, 1). */
          planned_waste_m3: number;
          /** Calculada pelo banco: previsto + perda prevista. */
          max_volume_m3: number;
          status: "nao_iniciado" | "andamento" | "concluido";
          drawing_path: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        /** planned_waste_m3 e max_volume_m3 sao geradas: nunca enviar. */
        Insert: {
          id?: string;
          site_id: string;
          location: string;
          floor_level?: string | null;
          name: string;
          concrete_spec?: string | null;
          fck_required?: number | null;
          slump_target?: number | null;
          supplier?: string | null;
          placement_method?: "bombeado" | "convencional";
          drawing_sheet?: string | null;
          drawing_revision?: string | null;
          planned_volume_m3: number;
          waste_percent?: number;
          status?: "nao_iniciado" | "andamento" | "concluido";
          drawing_path?: string | null;
          notes?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["structural_elements"]["Insert"]
        >;
        Relationships: [];
      };
      element_drawing_marks: {
        Row: {
          id: string;
          structural_element_id: string;
          truck_receipt_id: string | null;
          page_number: number;
          points: Json;
          color: string;
          label: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          structural_element_id: string;
          truck_receipt_id?: string | null;
          page_number?: number;
          points: Json;
          color: string;
          label?: string | null;
          created_by: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["element_drawing_marks"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: {
      element_volume_progress: {
        Row: {
          structural_element_id: string;
          site_id: string;
          location: string;
          floor_level: string | null;
          name: string;
          concrete_spec: string | null;
          fck_required: number | null;
          slump_target: number | null;
          placement_method: "bombeado" | "convencional";
          status: "nao_iniciado" | "andamento" | "concluido";
          /** F da planilha. */
          planned_volume_m3: number;
          /** G da planilha. */
          waste_percent: number;
          /** H da planilha. */
          planned_waste_m3: number;
          /** I da planilha: maximo a ser utilizado. */
          max_volume_m3: number;
          /** K da planilha: volume aplicado. */
          realized_volume_m3: number;
          /** M da planilha: perda realizada em m3. */
          actual_waste_m3: number | null;
          /** N da planilha: perda realizada em %. */
          actual_waste_percent: number | null;
          /** O da planilha: volume tendencia. */
          trend_volume_m3: number;
          /** Perda real do RESUMO: (tendencia - previsto) / previsto. */
          trend_waste_percent: number | null;
          progress_ratio: number | null;
          concretings_count: number;
          trucks_count: number;
          last_concreting_date: string | null;
        };
        Relationships: [];
      };
      element_drawing_legend: {
        Row: {
          structural_element_id: string;
          mark_id: string;
          page_number: number;
          color: string;
          label: string | null;
          truck_receipt_id: string | null;
          invoice_number: string | null;
          truck_number: string | null;
          volume_m3: number | null;
          marked_date: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      is_site_member: { Args: { p_site_id: string }; Returns: boolean };
      is_production_manager: { Args: { p_site_id: string }; Returns: boolean };
      current_profile_role: { Args: Record<string, never>; Returns: string };
      approve_concreting: {
        // Assinatura real da migracao: `approve_concreting(concreting_id, ...)`.
        Args: {
          concreting_id: string;
          p_approve?: boolean;
          p_reason?: string | null;
        };
        Returns: Database["public"]["Tables"]["concretings"]["Row"];
      };
    };
    Enums: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Profile = Tables<"profiles">;
export type Site = Tables<"sites">;
export type SiteMember = Tables<"site_members">;
export type Concreting = Tables<"concretings">;
export type NonconformityAlert = Tables<"nonconformity_alerts">;
export type PendingTest = Tables<"pending_tests">;

export type Views<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"];

export type StructuralElement = Tables<"structural_elements">;
export type ElementVolumeProgress = Views<"element_volume_progress">;
export type ElementDrawingLegend = Views<"element_drawing_legend">;
