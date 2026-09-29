export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          applied_at: string | null
          applied_date_source: string
          company: string
          company_key: string
          created_at: string
          id: string
          needs_review: boolean
          overrides: Json
          primary_recruiter_email: string | null
          recruiters: Json
          req_ids: string[]
          role: string
          role_key: string
          status: string
          thread_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          applied_date_source?: string
          company: string
          company_key: string
          created_at?: string
          id?: string
          needs_review?: boolean
          overrides?: Json
          primary_recruiter_email?: string | null
          recruiters?: Json
          req_ids?: string[]
          role?: string
          role_key?: string
          status?: string
          thread_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          applied_date_source?: string
          company?: string
          company_key?: string
          created_at?: string
          id?: string
          needs_review?: boolean
          overrides?: Json
          primary_recruiter_email?: string | null
          recruiters?: Json
          req_ids?: string[]
          role?: string
          role_key?: string
          status?: string
          thread_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_events: {
        Row: {
          application_id: string | null
          ats_source: string | null
          company: string | null
          confidence: number
          event_type: string
          from_email: string
          from_name: string | null
          match_confidence: number | null
          message_id: string
          parser_version: number
          reasons: string[]
          received_at: string
          recruiter_email: string | null
          recruiter_name: string | null
          req_id: string | null
          rfc822_message_id: string | null
          role: string | null
          snippet: string | null
          state: string
          subject: string
          thread_id: string
          user_id: string
          user_locked: boolean
        }
        Insert: {
          application_id?: string | null
          ats_source?: string | null
          company?: string | null
          confidence: number
          event_type: string
          from_email: string
          from_name?: string | null
          match_confidence?: number | null
          message_id: string
          parser_version: number
          reasons?: string[]
          received_at: string
          recruiter_email?: string | null
          recruiter_name?: string | null
          req_id?: string | null
          rfc822_message_id?: string | null
          role?: string | null
          snippet?: string | null
          state?: string
          subject: string
          thread_id: string
          user_id: string
          user_locked?: boolean
        }
        Update: {
          application_id?: string | null
          ats_source?: string | null
          company?: string | null
          confidence?: number
          event_type?: string
          from_email?: string
          from_name?: string | null
          match_confidence?: number | null
          message_id?: string
          parser_version?: number
          reasons?: string[]
          received_at?: string
          recruiter_email?: string | null
          recruiter_name?: string | null
          req_id?: string | null
          rfc822_message_id?: string | null
          role?: string | null
          snippet?: string | null
          state?: string
          subject?: string
          thread_id?: string
          user_id?: string
          user_locked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "email_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_connections: {
        Row: {
          access_token_enc: string | null
          access_token_expires_at: string | null
          created_at: string
          google_email: string
          refresh_token_enc: string
          scope: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_enc?: string | null
          access_token_expires_at?: string | null
          created_at?: string
          google_email: string
          refresh_token_enc: string
          scope: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_enc?: string | null
          access_token_expires_at?: string | null
          created_at?: string
          google_email?: string
          refresh_token_enc?: string
          scope?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      processed_messages: {
        Row: {
          is_job_related: boolean
          message_id: string
          parser_version: number
          processed_at: string
          user_id: string
        }
        Insert: {
          is_job_related: boolean
          message_id: string
          parser_version: number
          processed_at?: string
          user_id: string
        }
        Update: {
          is_job_related?: boolean
          message_id?: string
          parser_version?: number
          processed_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scan_items: {
        Row: {
          error: string | null
          message_id: string
          scan_id: string
          seq: number
          status: string
          user_id: string
        }
        Insert: {
          error?: string | null
          message_id: string
          scan_id: string
          seq: number
          status?: string
          user_id: string
        }
        Update: {
          error?: string | null
          message_id?: string
          scan_id?: string
          seq?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_items_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scans: {
        Row: {
          apps_created: number
          apps_updated: number
          error: string | null
          finished_at: string | null
          id: string
          job_related: number
          lock_token: string | null
          locked_until: string | null
          processed: number
          range_end: string
          range_start: string
          started_at: string
          status: string
          total: number
          user_id: string
        }
        Insert: {
          apps_created?: number
          apps_updated?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          job_related?: number
          lock_token?: string | null
          locked_until?: string | null
          processed?: number
          range_end: string
          range_start: string
          started_at?: string
          status: string
          total?: number
          user_id: string
        }
        Update: {
          apps_created?: number
          apps_updated?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          job_related?: number
          lock_token?: string | null
          locked_until?: string | null
          processed?: number
          range_end?: string
          range_start?: string
          started_at?: string
          status?: string
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          ai_provider: string | null
          first_name: string | null
          last_scan_at: string | null
          user_id: string
        }
        Insert: {
          ai_provider?: string | null
          first_name?: string | null
          last_scan_at?: string | null
          user_id: string
        }
        Update: {
          ai_provider?: string | null
          first_name?: string | null
          last_scan_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_scan_lease: { Args: { scan_id: string }; Returns: string }
      delete_application: { Args: { app_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
