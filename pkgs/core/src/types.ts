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
          dep_slug: string
          flow_slug: string
          step_slug: string
        }
        Insert: {
          dep_slug: string
          flow_slug: string
          step_slug: string
        }
        Update: {
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
          flow_slug: string
          opt_base_delay: number
          opt_max_attempts: number
          opt_timeout: number
        }
        Insert: {
          flow_slug: string
          opt_base_delay?: number
          opt_max_attempts?: number
          opt_timeout?: number
        }
        Update: {
          flow_slug?: string
          opt_base_delay?: number
          opt_max_attempts?: number
          opt_timeout?: number
        }
        Relationships: []
      }
      runs: {
        Row: {
          flow_slug: string
          input: Json
          output: Json | null
          remaining_steps: number
          run_id: string
          status: string
        }
        Insert: {
          flow_slug: string
          input: Json
          output?: Json | null
          remaining_steps?: number
          run_id?: string
          status?: string
        }
        Update: {
          flow_slug?: string
          input?: Json
          output?: Json | null
          remaining_steps?: number
          run_id?: string
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
          flow_slug: string
          remaining_deps: number
          remaining_tasks: number
          run_id: string
          status: string
          step_slug: string
        }
        Insert: {
          flow_slug: string
          remaining_deps?: number
          remaining_tasks?: number
          run_id: string
          status?: string
          step_slug: string
        }
        Update: {
          flow_slug?: string
          remaining_deps?: number
          remaining_tasks?: number
          run_id?: string
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
          error_message: string | null
          flow_slug: string
          message_id: number | null
          output: Json | null
          run_id: string
          status: string
          step_slug: string
          task_index: number
        }
        Insert: {
          attempts_count?: number
          error_message?: string | null
          flow_slug: string
          message_id?: number | null
          output?: Json | null
          run_id: string
          status?: string
          step_slug: string
          task_index?: number
        }
        Update: {
          attempts_count?: number
          error_message?: string | null
          flow_slug?: string
          message_id?: number | null
          output?: Json | null
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
          deps_count: number
          flow_slug: string
          opt_base_delay: number | null
          opt_max_attempts: number | null
          opt_timeout: number | null
          step_slug: string
          step_type: string
        }
        Insert: {
          deps_count?: number
          flow_slug: string
          opt_base_delay?: number | null
          opt_max_attempts?: number | null
          opt_timeout?: number | null
          step_slug: string
          step_type?: string
        }
        Update: {
          deps_count?: number
          flow_slug?: string
          opt_base_delay?: number | null
          opt_max_attempts?: number | null
          opt_timeout?: number | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_step:
        | {
            Args: {
              flow_slug: string
              step_slug: string
              deps_slugs: string[]
              max_attempts?: number
              base_delay?: number
              timeout?: number
            }
            Returns: {
              deps_count: number
              flow_slug: string
              opt_base_delay: number | null
              opt_max_attempts: number | null
              opt_timeout: number | null
              step_slug: string
              step_type: string
            }
          }
        | {
            Args: {
              flow_slug: string
              step_slug: string
              max_attempts?: number
              base_delay?: number
              timeout?: number
            }
            Returns: {
              deps_count: number
              flow_slug: string
              opt_base_delay: number | null
              opt_max_attempts: number | null
              opt_timeout: number | null
              step_slug: string
              step_type: string
            }
          }
      calculate_retry_delay: {
        Args: {
          base_delay: number
          attempts_count: number
        }
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
          error_message: string | null
          flow_slug: string
          message_id: number | null
          output: Json | null
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
          error_message: string | null
          flow_slug: string
          message_id: number | null
          output: Json | null
          run_id: string
          status: string
          step_slug: string
          task_index: number
        }[]
      }
      is_valid_slug: {
        Args: {
          slug: string
        }
        Returns: boolean
      }
      maybe_complete_run: {
        Args: {
          run_id: string
        }
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
        Returns: Database["pgflow"]["CompositeTypes"]["worker_task"][]
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
        Args: {
          flow_slug: string
          input: Json
        }
        Returns: {
          flow_slug: string
          input: Json
          output: Json | null
          remaining_steps: number
          run_id: string
          status: string
        }[]
      }
      start_ready_steps: {
        Args: {
          run_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      worker_task: {
        flow_slug: string | null
        run_id: string | null
        step_slug: string | null
        input: Json | null
      }
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

