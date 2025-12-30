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
          initial_tasks: number | null
          remaining_deps: number
          remaining_tasks: number | null
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
          initial_tasks?: number | null
          remaining_deps?: number
          remaining_tasks?: number | null
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
          initial_tasks?: number | null
          remaining_deps?: number
          remaining_tasks?: number | null
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
          opt_start_delay: number | null
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
          opt_start_delay?: number | null
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
          opt_start_delay?: number | null
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
      worker_functions: {
        Row: {
          created_at: string
          debounce: unknown
          enabled: boolean
          function_name: string
          last_invoked_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          debounce?: unknown
          enabled?: boolean
          function_name: string
          last_invoked_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          debounce?: unknown
          enabled?: boolean
          function_name?: string
          last_invoked_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      workers: {
        Row: {
          deprecated_at: string | null
          function_name: string
          last_heartbeat_at: string
          queue_name: string
          started_at: string
          stopped_at: string | null
          worker_id: string
        }
        Insert: {
          deprecated_at?: string | null
          function_name: string
          last_heartbeat_at?: string
          queue_name: string
          started_at?: string
          stopped_at?: string | null
          worker_id: string
        }
        Update: {
          deprecated_at?: string | null
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
      _compare_flow_shapes: {
        Args: { p_db: Json; p_local: Json }
        Returns: string[]
      }
      _create_flow_from_shape: {
        Args: { p_flow_slug: string; p_shape: Json }
        Returns: undefined
      }
      _get_flow_shape: { Args: { p_flow_slug: string }; Returns: Json }
      add_step: {
        Args: {
          base_delay?: number
          deps_slugs?: string[]
          flow_slug: string
          max_attempts?: number
          start_delay?: number
          step_slug: string
          step_type?: string
          timeout?: number
        }
        Returns: {
          created_at: string
          deps_count: number
          flow_slug: string
          opt_base_delay: number | null
          opt_max_attempts: number | null
          opt_start_delay: number | null
          opt_timeout: number | null
          step_index: number
          step_slug: string
          step_type: string
        }
        SetofOptions: {
          from: "*"
          to: "steps"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      calculate_retry_delay: {
        Args: { attempts_count: number; base_delay: number }
        Returns: number
      }
      cascade_complete_taskless_steps: {
        Args: { run_id: string }
        Returns: number
      }
      cleanup_ensure_workers_logs: {
        Args: { retention_hours?: number }
        Returns: {
          cron_deleted: number
        }[]
      }
      complete_task: {
        Args: {
          output: Json
          run_id: string
          step_slug: string
          task_index: number
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
        SetofOptions: {
          from: "*"
          to: "step_tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_flow: {
        Args: {
          base_delay?: number
          flow_slug: string
          max_attempts?: number
          timeout?: number
        }
        Returns: {
          created_at: string
          flow_slug: string
          opt_base_delay: number
          opt_max_attempts: number
          opt_timeout: number
        }
        SetofOptions: {
          from: "*"
          to: "flows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_flow_and_data: {
        Args: { p_flow_slug: string }
        Returns: undefined
      }
      ensure_flow_compiled: {
        Args: { allow_data_loss?: boolean; flow_slug: string; shape: Json }
        Returns: Json
      }
      ensure_workers: {
        Args: never
        Returns: {
          function_name: string
          invoked: boolean
          request_id: number
        }[]
      }
      fail_task: {
        Args: {
          error_message: string
          run_id: string
          step_slug: string
          task_index: number
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
        SetofOptions: {
          from: "*"
          to: "step_tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_run_with_states: { Args: { run_id: string }; Returns: Json }
      is_local: { Args: never; Returns: boolean }
      is_valid_slug: { Args: { slug: string }; Returns: boolean }
      mark_worker_stopped: { Args: { worker_id: string }; Returns: undefined }
      maybe_complete_run: { Args: { run_id: string }; Returns: undefined }
      poll_for_tasks: {
        Args: {
          max_poll_seconds?: number
          poll_interval_ms?: number
          qty: number
          queue_name: string
          vt: number
        }
        Returns: Database["pgflow"]["CompositeTypes"]["step_task_record"][]
        SetofOptions: {
          from: "*"
          to: "step_task_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_vt_batch: {
        Args: { msg_ids: number[]; queue_name: string; vt_offsets: number[] }
        Returns: {
          enqueued_at: string
          headers: Json
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      setup_ensure_workers_cron: {
        Args: { cron_interval?: string }
        Returns: string
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
        SetofOptions: {
          from: "*"
          to: "runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      start_flow_with_states: {
        Args: { flow_slug: string; input: Json; run_id?: string }
        Returns: Json
      }
      start_ready_steps: { Args: { run_id: string }; Returns: undefined }
      start_tasks: {
        Args: { flow_slug: string; msg_ids: number[]; worker_id: string }
        Returns: Database["pgflow"]["CompositeTypes"]["step_task_record"][]
        SetofOptions: {
          from: "*"
          to: "step_task_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      track_worker_function: {
        Args: { function_name: string }
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
        task_index: number | null
        flow_input: Json | null
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
      _belongs_to_pgmq: { Args: { table_name: string }; Returns: boolean }
      _ensure_pg_partman_installed: { Args: never; Returns: undefined }
      _extension_exists: { Args: { extension_name: string }; Returns: boolean }
      _get_partition_col: {
        Args: { partition_interval: string }
        Returns: string
      }
      _get_pg_partman_major_version: { Args: never; Returns: number }
      _get_pg_partman_schema: { Args: never; Returns: string }
      archive:
        | { Args: { msg_id: number; queue_name: string }; Returns: boolean }
        | { Args: { msg_ids: number[]; queue_name: string }; Returns: number[] }
      convert_archive_partitioned: {
        Args: {
          leading_partition?: number
          partition_interval?: string
          retention_interval?: string
          table_name: string
        }
        Returns: undefined
      }
      create: { Args: { queue_name: string }; Returns: undefined }
      create_non_partitioned: {
        Args: { queue_name: string }
        Returns: undefined
      }
      create_partitioned: {
        Args: {
          partition_interval?: string
          queue_name: string
          retention_interval?: string
        }
        Returns: undefined
      }
      create_unlogged: { Args: { queue_name: string }; Returns: undefined }
      delete:
        | { Args: { msg_id: number; queue_name: string }; Returns: boolean }
        | { Args: { msg_ids: number[]; queue_name: string }; Returns: number[] }
      detach_archive: { Args: { queue_name: string }; Returns: undefined }
      drop_queue:
        | { Args: { queue_name: string }; Returns: boolean }
        | {
            Args: { partitioned: boolean; queue_name: string }
            Returns: boolean
          }
      format_table_name: {
        Args: { prefix: string; queue_name: string }
        Returns: string
      }
      list_queues: {
        Args: never
        Returns: Database["pgmq"]["CompositeTypes"]["queue_record"][]
        SetofOptions: {
          from: "*"
          to: "queue_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      metrics: {
        Args: { queue_name: string }
        Returns: Database["pgmq"]["CompositeTypes"]["metrics_result"]
        SetofOptions: {
          from: "*"
          to: "metrics_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      metrics_all: {
        Args: never
        Returns: Database["pgmq"]["CompositeTypes"]["metrics_result"][]
        SetofOptions: {
          from: "*"
          to: "metrics_result"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      pop: {
        Args: { queue_name: string }
        Returns: Database["pgmq"]["CompositeTypes"]["message_record"][]
        SetofOptions: {
          from: "*"
          to: "message_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      purge_queue: { Args: { queue_name: string }; Returns: number }
      read: {
        Args: {
          conditional?: Json
          qty: number
          queue_name: string
          vt: number
        }
        Returns: Database["pgmq"]["CompositeTypes"]["message_record"][]
        SetofOptions: {
          from: "*"
          to: "message_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read_with_poll: {
        Args: {
          conditional?: Json
          max_poll_seconds?: number
          poll_interval_ms?: number
          qty: number
          queue_name: string
          vt: number
        }
        Returns: Database["pgmq"]["CompositeTypes"]["message_record"][]
        SetofOptions: {
          from: "*"
          to: "message_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      send:
        | {
            Args: {
              delay: string
              headers: Json
              msg: Json
              queue_name: string
            }
            Returns: number[]
          }
        | {
            Args: { delay: string; msg: Json; queue_name: string }
            Returns: number[]
          }
        | { Args: { msg: Json; queue_name: string }; Returns: number[] }
        | {
            Args: { delay: number; msg: Json; queue_name: string }
            Returns: number[]
          }
        | {
            Args: { headers: Json; msg: Json; queue_name: string }
            Returns: number[]
          }
        | {
            Args: {
              delay: number
              headers: Json
              msg: Json
              queue_name: string
            }
            Returns: number[]
          }
      send_batch:
        | {
            Args: {
              delay: string
              headers: Json[]
              msgs: Json[]
              queue_name: string
            }
            Returns: number[]
          }
        | {
            Args: { delay: string; msgs: Json[]; queue_name: string }
            Returns: number[]
          }
        | { Args: { msgs: Json[]; queue_name: string }; Returns: number[] }
        | {
            Args: { delay: number; msgs: Json[]; queue_name: string }
            Returns: number[]
          }
        | {
            Args: { headers: Json[]; msgs: Json[]; queue_name: string }
            Returns: number[]
          }
        | {
            Args: {
              delay: number
              headers: Json[]
              msgs: Json[]
              queue_name: string
            }
            Returns: number[]
          }
      set_vt: {
        Args: { msg_id: number; queue_name: string; vt: number }
        Returns: Database["pgmq"]["CompositeTypes"]["message_record"][]
        SetofOptions: {
          from: "*"
          to: "message_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      validate_queue_name: { Args: { queue_name: string }; Returns: undefined }
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
        headers: Json | null
      }
      metrics_result: {
        queue_name: string | null
        queue_length: number | null
        newest_msg_age_sec: number | null
        oldest_msg_age_sec: number | null
        total_messages: number | null
        scrape_time: string | null
        queue_visible_length: number | null
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
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

