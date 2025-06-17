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
          error_message: string | null
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
          error_message?: string | null
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
          error_message?: string | null
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
          last_worker_id: string | null
          message_id: number | null
          output: Json | null
          queued_at: string
          run_id: string
          started_at: string | null
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
          last_worker_id?: string | null
          message_id?: number | null
          output?: Json | null
          queued_at?: string
          run_id: string
          started_at?: string | null
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
          last_worker_id?: string | null
          message_id?: number | null
          output?: Json | null
          queued_at?: string
          run_id?: string
          started_at?: string | null
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
            foreignKeyName: "step_tasks_last_worker_id_fkey"
            columns: ["last_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
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
          last_worker_id: string | null
          message_id: number | null
          output: Json | null
          queued_at: string
          run_id: string
          started_at: string | null
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
          last_worker_id: string | null
          message_id: number | null
          output: Json | null
          queued_at: string
          run_id: string
          started_at: string | null
          status: string
          step_slug: string
          task_index: number
        }[]
      }
      get_run_with_states: {
        Args: { run_id: string }
        Returns: Json
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
        Returns: Database["pgmq"]["CompositeTypes"]["message_record"][]
      }
      set_vt_batch: {
        Args: { queue_name: string; msg_ids: number[]; vt_offsets: number[] }
        Returns: Database["pgmq"]["CompositeTypes"]["message_record"][]
      }
      start_flow: {
        Args: { flow_slug: string; input: Json; run_id?: string }
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
      start_flow_with_states: {
        Args: { flow_slug: string; input: Json; run_id?: string }
        Returns: Json
      }
      start_ready_steps: {
        Args: { run_id: string }
        Returns: undefined
      }
      start_tasks: {
        Args: { flow_slug: string; msg_ids: number[]; worker_id: string }
        Returns: Database["pgflow"]["CompositeTypes"]["step_task_record"][]
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
  pgmq: {
    Tables: {
      meta: {
        Row: {
          created_at: string
          is_partitioned: boolean
          is_unlogged: boolean
          queue_name: string
        }
        Insert: {
          created_at?: string
          is_partitioned: boolean
          is_unlogged: boolean
          queue_name: string
        }
        Update: {
          created_at?: string
          is_partitioned?: boolean
          is_unlogged?: boolean
          queue_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _belongs_to_pgmq: {
        Args: { table_name: string }
        Returns: boolean
      }
      _ensure_pg_partman_installed: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      _get_partition_col: {
        Args: { partition_interval: string }
        Returns: string
      }
      _get_pg_partman_major_version: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      _get_pg_partman_schema: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      archive: {
        Args:
          | { queue_name: string; msg_id: number }
          | { queue_name: string; msg_ids: number[] }
        Returns: boolean
      }
      convert_archive_partitioned: {
        Args: {
          table_name: string
          partition_interval?: string
          retention_interval?: string
          leading_partition?: number
        }
        Returns: undefined
      }
      create: {
        Args: { queue_name: string }
        Returns: undefined
      }
      create_non_partitioned: {
        Args: { queue_name: string }
        Returns: undefined
      }
      create_partitioned: {
        Args: {
          queue_name: string
          partition_interval?: string
          retention_interval?: string
        }
        Returns: undefined
      }
      create_unlogged: {
        Args: { queue_name: string }
        Returns: undefined
      }
      delete: {
        Args:
          | { queue_name: string; msg_id: number }
          | { queue_name: string; msg_ids: number[] }
        Returns: boolean
      }
      detach_archive: {
        Args: { queue_name: string }
        Returns: undefined
      }
      drop_queue: {
        Args: { queue_name: string }
        Returns: boolean
      }
      format_table_name: {
        Args: { queue_name: string; prefix: string }
        Returns: string
      }
      list_queues: {
        Args: Record<PropertyKey, never>
        Returns: Database["pgmq"]["CompositeTypes"]["queue_record"][]
      }
      metrics: {
        Args: { queue_name: string }
        Returns: Database["pgmq"]["CompositeTypes"]["metrics_result"]
      }
      metrics_all: {
        Args: Record<PropertyKey, never>
        Returns: Database["pgmq"]["CompositeTypes"]["metrics_result"][]
      }
      pop: {
        Args: { queue_name: string }
        Returns: Database["pgmq"]["CompositeTypes"]["message_record"][]
      }
      purge_queue: {
        Args: { queue_name: string }
        Returns: number
      }
      read: {
        Args: { queue_name: string; vt: number; qty: number }
        Returns: Database["pgmq"]["CompositeTypes"]["message_record"][]
      }
      read_with_poll: {
        Args: {
          queue_name: string
          vt: number
          qty: number
          max_poll_seconds?: number
          poll_interval_ms?: number
        }
        Returns: Database["pgmq"]["CompositeTypes"]["message_record"][]
      }
      send: {
        Args: { queue_name: string; msg: Json; delay?: number }
        Returns: number[]
      }
      send_batch: {
        Args: { queue_name: string; msgs: Json[]; delay?: number }
        Returns: number[]
      }
      set_vt: {
        Args: { queue_name: string; msg_id: number; vt: number }
        Returns: Database["pgmq"]["CompositeTypes"]["message_record"][]
      }
      validate_queue_name: {
        Args: { queue_name: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      message_record: {
        msg_id: number | null
        read_ct: number | null
        enqueued_at: string | null
        vt: string | null
        message: Json | null
      }
      metrics_result: {
        queue_name: string | null
        queue_length: number | null
        newest_msg_age_sec: number | null
        oldest_msg_age_sec: number | null
        total_messages: number | null
        scrape_time: string | null
      }
      queue_record: {
        queue_name: string | null
        is_partitioned: boolean | null
        is_unlogged: boolean | null
        created_at: string | null
      }
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
  pgmq: {
    Enums: {},
  },
} as const

