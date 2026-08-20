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
    };
    Views: Record<string, never>;
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
