export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  pgflow: {
    Tables: {
      deps: {
        Row: {
          created_at: string
          dep_slug: string
          flow_slug: string
          step_slug: string
        }
        Insert: {
          created_at?: string
          dep_slug: string
          flow_slug: string
          step_slug: string
        }
        Update: {
          created_at?: string
          dep_slug?: string
          flow_slug?: string
          step_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "deps_flow_slug_dep_slug_fkey"
            columns: ["flow_slug", "dep_slug"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["flow_slug", "step_slug"]
          },
          {
            foreignKeyName: "deps_flow_slug_fkey"
            columns: ["flow_slug"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["flow_slug"]
          },
          {
            foreignKeyName: "deps_flow_slug_step_slug_fkey"
            columns: ["flow_slug", "step_slug"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["flow_slug", "step_slug"]
          },
        ]
      }
      flows: {
        Row: {
          created_at: string
          flow_slug: string
          opt_base_delay: number
          opt_max_attempts: number
          opt_timeout: number
        }
        Insert: {
          created_at?: string
          flow_slug: string
          opt_base_delay?: number
          opt_max_attempts?: number
          opt_timeout?: number
        }
        Update: {
          created_at?: string
          flow_slug?: string
          opt_base_delay?: number
          opt_max_attempts?: number
          opt_timeout?: number
        }
        Relationships: []
      }
      runs: {
        Row: {
          completed_at: string | null
          failed_at: string | null
          flow_slug: string
          input: Json
          output: Json | null
          remaining_steps: number
          run_id: string
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          failed_at?: string | null
          flow_slug: string
          input: Json
          output?: Json | null
          remaining_steps?: number
          run_id?: string
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          failed_at?: string | null
          flow_slug?: string
          input?: Json
          output?: Json | null
          remaining_steps?: number
          run_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "runs_flow_slug_fkey"
            columns: ["flow_slug"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["flow_slug"]
          },
        ]
      }
      step_states: {
        Row: {
          completed_at: string | null
          created_at: string
          failed_at: string | null
          flow_slug: string
          remaining_deps: number
          remaining_tasks: number
          run_id: string
          started_at: string | null
          status: string
          step_slug: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          failed_at?: string | null
          flow_slug: string
          remaining_deps?: number
          remaining_tasks?: number
          run_id: string
          started_at?: string | null
          status?: string
          step_slug: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          failed_at?: string | null
          flow_slug?: string
          remaining_deps?: number
          remaining_tasks?: number
          run_id?: string
          started_at?: string | null
          status?: string
          step_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_states_flow_slug_fkey"
            columns: ["flow_slug"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["flow_slug"]
          },
          {
            foreignKeyName: "step_states_flow_slug_step_slug_fkey"
            columns: ["flow_slug", "step_slug"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["flow_slug", "step_slug"]
          },
          {
            foreignKeyName: "step_states_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      step_tasks: {
        Row: {
          attempts_count: number
          completed_at: string | null
          error_message: string | null
          failed_at: string | null
          flow_slug: string
          message_id: number | null
          output: Json | null
          queued_at: string
          run_id: string
          status: string
          step_slug: string
          task_index: number
        }
        Insert: {
          attempts_count?: number
          completed_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          flow_slug: string
          message_id?: number | null
          output?: Json | null
          queued_at?: string
          run_id: string
          status?: string
          step_slug: string
          task_index?: number
        }
        Update: {
          attempts_count?: number
          completed_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          flow_slug?: string
          message_id?: number | null
          output?: Json | null
          queued_at?: string
          run_id?: string
          status?: string
          step_slug?: string
          task_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "step_tasks_flow_slug_fkey"
            columns: ["flow_slug"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["flow_slug"]
          },
          {
            foreignKeyName: "step_tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "step_tasks_run_id_step_slug_fkey"
            columns: ["run_id", "step_slug"]
            isOneToOne: false
            referencedRelation: "step_states"
            referencedColumns: ["run_id", "step_slug"]
          },
        ]
      }
      steps: {
        Row: {
          created_at: string
          deps_count: number
          flow_slug: string
          opt_base_delay: number | null
          opt_max_attempts: number | null
          opt_timeout: number | null
          step_index: number
          step_slug: string
          step_type: string
        }
        Insert: {
          created_at?: string
          deps_count?: number
          flow_slug: string
          opt_base_delay?: number | null
          opt_max_attempts?: number | null
          opt_timeout?: number | null
          step_index?: number
          step_slug: string
          step_type?: string
        }
        Update: {
          created_at?: string
          deps_count?: number
          flow_slug?: string
          opt_base_delay?: number | null
          opt_max_attempts?: number | null
          opt_timeout?: number | null
          step_index?: number
          step_slug?: string
          step_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "steps_flow_slug_fkey"
            columns: ["flow_slug"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["flow_slug"]
          },
        ]
      }
      workers: {
        Row: {
          function_name: string
          last_heartbeat_at: string
          queue_name: string
          started_at: string
          stopped_at: string | null
          worker_id: string
        }
        Insert: {
          function_name: string
          last_heartbeat_at?: string
          queue_name: string
          started_at?: string
          stopped_at?: string | null
          worker_id: string
        }
        Update: {
          function_name?: string
          last_heartbeat_at?: string
          queue_name?: string
          started_at?: string
          stopped_at?: string | null
          worker_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_step: {
        Args:
          | {
              flow_slug: string
              step_slug: string
              deps_slugs: string[]
              max_attempts?: number
              base_delay?: number
              timeout?: number
            }
          | {
              flow_slug: string
              step_slug: string
              max_attempts?: number
              base_delay?: number
              timeout?: number
            }
        Returns: {
          created_at: string
          deps_count: number
          flow_slug: string
          opt_base_delay: number | null
          opt_max_attempts: number | null
          opt_timeout: number | null
          step_index: number
          step_slug: string
          step_type: string
        }
      }
      calculate_retry_delay: {
        Args: { base_delay: number; attempts_count: number }
        Returns: number
      }
      complete_task: {
        Args: {
          run_id: string
          step_slug: string
          task_index: number
          output: Json
        }
        Returns: {
          attempts_count: number
          completed_at: string | null
          error_message: string | null
          failed_at: string | null
          flow_slug: string
          message_id: number | null
          output: Json | null
          queued_at: string
          run_id: string
          status: string
          step_slug: string
          task_index: number
        }[]
      }
      create_flow: {
        Args: {
          flow_slug: string
          max_attempts?: number
          base_delay?: number
          timeout?: number
        }
        Returns: {
          created_at: string
          flow_slug: string
          opt_base_delay: number
          opt_max_attempts: number
          opt_timeout: number
        }
      }
      fail_task: {
        Args: {
          run_id: string
          step_slug: string
          task_index: number
          error_message: string
        }
        Returns: {
          attempts_count: number
          completed_at: string | null
          error_message: string | null
          failed_at: string | null
          flow_slug: string
          message_id: number | null
          output: Json | null
          queued_at: string
          run_id: string
          status: string
          step_slug: string
          task_index: number
        }[]
      }
      is_valid_slug: {
        Args: { slug: string }
        Returns: boolean
      }
      maybe_complete_run: {
        Args: { run_id: string }
        Returns: undefined
      }
      poll_for_tasks: {
        Args: {
          queue_name: string
          vt: number
          qty: number
          max_poll_seconds?: number
          poll_interval_ms?: number
        }
        Returns: Database["pgflow"]["CompositeTypes"]["step_task_record"][]
      }
      read_with_poll: {
        Args: {
          queue_name: string
          vt: number
          qty: number
          max_poll_seconds?: number
          poll_interval_ms?: number
          conditional?: Json
        }
        Returns: unknown[]
      }
      start_flow: {
        Args: { flow_slug: string; input: Json }
        Returns: {
          completed_at: string | null
          failed_at: string | null
          flow_slug: string
          input: Json
          output: Json | null
          remaining_steps: number
          run_id: string
          started_at: string
          status: string
        }[]
      }
      start_ready_steps: {
        Args: { run_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      step_task_record: {
        flow_slug: string | null
        run_id: string | null
        step_slug: string | null
        input: Json | null
        msg_id: number | null
      }
    }
  }
  public: {
    Tables: {
      websites: {
        Row: {
          created_at: string
          id: number
          sentiment: number
          summary: string
          tags: string[]
          updated_at: string
          user_id: string
          website_url: string
        }
        Insert: {
          created_at?: string
          id?: number
          sentiment: number
          summary: string
          tags?: string[]
          updated_at?: string
          user_id: string
          website_url: string
        }
        Update: {
          created_at?: string
          id?: number
          sentiment?: number
          summary?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
          website_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      start_analyze_website_flow: {
        Args: { url: string }
        Returns: {
          completed_at: string | null
          failed_at: string | null
          flow_slug: string
          input: Json
          output: Json | null
          remaining_steps: number
          run_id: string
          started_at: string
          status: string
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  pgflow: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

