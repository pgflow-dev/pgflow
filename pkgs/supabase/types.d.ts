export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  acl: {
    Tables: {
      superadmin_emails: {
        Row: {
          email: string
        }
        Insert: {
          email: string
        }
        Update: {
          email?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  auth: {
    Tables: {
      audit_log_entries: {
        Row: {
          created_at: string | null
          id: string
          instance_id: string | null
          ip_address: string
          payload: Json | null
        }
        Insert: {
          created_at?: string | null
          id: string
          instance_id?: string | null
          ip_address?: string
          payload?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          instance_id?: string | null
          ip_address?: string
          payload?: Json | null
        }
        Relationships: []
      }
      flow_state: {
        Row: {
          auth_code: string
          auth_code_issued_at: string | null
          authentication_method: string
          code_challenge: string
          code_challenge_method: Database["auth"]["Enums"]["code_challenge_method"]
          created_at: string | null
          id: string
          provider_access_token: string | null
          provider_refresh_token: string | null
          provider_type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auth_code: string
          auth_code_issued_at?: string | null
          authentication_method: string
          code_challenge: string
          code_challenge_method: Database["auth"]["Enums"]["code_challenge_method"]
          created_at?: string | null
          id: string
          provider_access_token?: string | null
          provider_refresh_token?: string | null
          provider_type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auth_code?: string
          auth_code_issued_at?: string | null
          authentication_method?: string
          code_challenge?: string
          code_challenge_method?: Database["auth"]["Enums"]["code_challenge_method"]
          created_at?: string | null
          id?: string
          provider_access_token?: string | null
          provider_refresh_token?: string | null
          provider_type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      identities: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          identity_data: Json
          last_sign_in_at: string | null
          provider: string
          provider_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          identity_data: Json
          last_sign_in_at?: string | null
          provider: string
          provider_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          identity_data?: Json
          last_sign_in_at?: string | null
          provider?: string
          provider_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      instances: {
        Row: {
          created_at: string | null
          id: string
          raw_base_config: string | null
          updated_at: string | null
          uuid: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          raw_base_config?: string | null
          updated_at?: string | null
          uuid?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          raw_base_config?: string | null
          updated_at?: string | null
          uuid?: string | null
        }
        Relationships: []
      }
      mfa_amr_claims: {
        Row: {
          authentication_method: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          authentication_method: string
          created_at: string
          id: string
          session_id: string
          updated_at: string
        }
        Update: {
          authentication_method?: string
          created_at?: string
          id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mfa_amr_claims_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_challenges: {
        Row: {
          created_at: string
          factor_id: string
          id: string
          ip_address: unknown
          otp_code: string | null
          verified_at: string | null
        }
        Insert: {
          created_at: string
          factor_id: string
          id: string
          ip_address: unknown
          otp_code?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          factor_id?: string
          id?: string
          ip_address?: unknown
          otp_code?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_challenges_auth_factor_id_fkey"
            columns: ["factor_id"]
            isOneToOne: false
            referencedRelation: "mfa_factors"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_factors: {
        Row: {
          created_at: string
          factor_type: Database["auth"]["Enums"]["factor_type"]
          friendly_name: string | null
          id: string
          last_challenged_at: string | null
          phone: string | null
          secret: string | null
          status: Database["auth"]["Enums"]["factor_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at: string
          factor_type: Database["auth"]["Enums"]["factor_type"]
          friendly_name?: string | null
          id: string
          last_challenged_at?: string | null
          phone?: string | null
          secret?: string | null
          status: Database["auth"]["Enums"]["factor_status"]
          updated_at: string
          user_id: string
        }
        Update: {
          created_at?: string
          factor_type?: Database["auth"]["Enums"]["factor_type"]
          friendly_name?: string | null
          id?: string
          last_challenged_at?: string | null
          phone?: string | null
          secret?: string | null
          status?: Database["auth"]["Enums"]["factor_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mfa_factors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      one_time_tokens: {
        Row: {
          created_at: string
          id: string
          relates_to: string
          token_hash: string
          token_type: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          relates_to: string
          token_hash: string
          token_type: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          relates_to?: string
          token_hash?: string
          token_type?: Database["auth"]["Enums"]["one_time_token_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_time_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      refresh_tokens: {
        Row: {
          created_at: string | null
          id: number
          instance_id: string | null
          parent: string | null
          revoked: boolean | null
          session_id: string | null
          token: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          instance_id?: string | null
          parent?: string | null
          revoked?: boolean | null
          session_id?: string | null
          token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          instance_id?: string | null
          parent?: string | null
          revoked?: boolean | null
          session_id?: string | null
          token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refresh_tokens_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_providers: {
        Row: {
          attribute_mapping: Json | null
          created_at: string | null
          entity_id: string
          id: string
          metadata_url: string | null
          metadata_xml: string
          name_id_format: string | null
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          attribute_mapping?: Json | null
          created_at?: string | null
          entity_id: string
          id: string
          metadata_url?: string | null
          metadata_xml: string
          name_id_format?: string | null
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          attribute_mapping?: Json | null
          created_at?: string | null
          entity_id?: string
          id?: string
          metadata_url?: string | null
          metadata_xml?: string
          name_id_format?: string | null
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saml_providers_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      saml_relay_states: {
        Row: {
          created_at: string | null
          flow_state_id: string | null
          for_email: string | null
          id: string
          redirect_to: string | null
          request_id: string
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          flow_state_id?: string | null
          for_email?: string | null
          id: string
          redirect_to?: string | null
          request_id: string
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          flow_state_id?: string | null
          for_email?: string | null
          id?: string
          redirect_to?: string | null
          request_id?: string
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saml_relay_states_flow_state_id_fkey"
            columns: ["flow_state_id"]
            isOneToOne: false
            referencedRelation: "flow_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saml_relay_states_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          version: string
        }
        Insert: {
          version: string
        }
        Update: {
          version?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          aal: Database["auth"]["Enums"]["aal_level"] | null
          created_at: string | null
          factor_id: string | null
          id: string
          ip: unknown | null
          not_after: string | null
          refreshed_at: string | null
          tag: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          aal?: Database["auth"]["Enums"]["aal_level"] | null
          created_at?: string | null
          factor_id?: string | null
          id: string
          ip?: unknown | null
          not_after?: string | null
          refreshed_at?: string | null
          tag?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          aal?: Database["auth"]["Enums"]["aal_level"] | null
          created_at?: string | null
          factor_id?: string | null
          id?: string
          ip?: unknown | null
          not_after?: string | null
          refreshed_at?: string | null
          tag?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_domains: {
        Row: {
          created_at: string | null
          domain: string
          id: string
          sso_provider_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          domain: string
          id: string
          sso_provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
          sso_provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sso_domains_sso_provider_id_fkey"
            columns: ["sso_provider_id"]
            isOneToOne: false
            referencedRelation: "sso_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_providers: {
        Row: {
          created_at: string | null
          id: string
          resource_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          resource_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          resource_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          aud: string | null
          banned_until: string | null
          confirmation_sent_at: string | null
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          email_change: string | null
          email_change_confirm_status: number | null
          email_change_sent_at: string | null
          email_change_token_current: string | null
          email_change_token_new: string | null
          email_confirmed_at: string | null
          encrypted_password: string | null
          id: string
          instance_id: string | null
          invited_at: string | null
          is_anonymous: boolean
          is_sso_user: boolean
          is_super_admin: boolean | null
          last_sign_in_at: string | null
          phone: string | null
          phone_change: string | null
          phone_change_sent_at: string | null
          phone_change_token: string | null
          phone_confirmed_at: string | null
          raw_app_meta_data: Json | null
          raw_user_meta_data: Json | null
          reauthentication_sent_at: string | null
          reauthentication_token: string | null
          recovery_sent_at: string | null
          recovery_token: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean
          is_sso_user?: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          aud?: string | null
          banned_until?: string | null
          confirmation_sent_at?: string | null
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          email_change?: string | null
          email_change_confirm_status?: number | null
          email_change_sent_at?: string | null
          email_change_token_current?: string | null
          email_change_token_new?: string | null
          email_confirmed_at?: string | null
          encrypted_password?: string | null
          id?: string
          instance_id?: string | null
          invited_at?: string | null
          is_anonymous?: boolean
          is_sso_user?: boolean
          is_super_admin?: boolean | null
          last_sign_in_at?: string | null
          phone?: string | null
          phone_change?: string | null
          phone_change_sent_at?: string | null
          phone_change_token?: string | null
          phone_confirmed_at?: string | null
          raw_app_meta_data?: Json | null
          raw_user_meta_data?: Json | null
          reauthentication_sent_at?: string | null
          reauthentication_token?: string | null
          recovery_sent_at?: string | null
          recovery_token?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      email: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      jwt: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      uid: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      aal_level: "aal1" | "aal2" | "aal3"
      code_challenge_method: "s256" | "plain"
      factor_status: "unverified" | "verified"
      factor_type: "totp" | "webauthn" | "phone"
      one_time_token_type:
        | "confirmation_token"
        | "reauthentication_token"
        | "recovery_token"
        | "email_change_token_new"
        | "email_change_token_current"
        | "phone_change_token"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  chat: {
    Tables: {
      conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  feed: {
    Tables: {
      bookmarks: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          reason: string | null
          share_id: string
          short_summary: string
          tags: string[] | null
          title: string
          type: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id?: string
          reason?: string | null
          share_id: string
          short_summary: string
          tags?: string[] | null
          title: string
          type?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          reason?: string | null
          share_id?: string
          short_summary?: string
          tags?: string[] | null
          title?: string
          type?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "shares"
            referencedColumns: ["id"]
          },
        ]
      }
      code_snippets: {
        Row: {
          created_at: string
          description: string
          id: string
          language_code: string
          owner_id: string
          reason: string | null
          share_id: string
          short_summary: string
          source: string
          tags: string[] | null
          type: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          language_code: string
          owner_id?: string
          reason?: string | null
          share_id: string
          short_summary: string
          source: string
          tags?: string[] | null
          type?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          language_code?: string
          owner_id?: string
          reason?: string | null
          share_id?: string
          short_summary?: string
          source?: string
          tags?: string[] | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "code_snippets_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "shares"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          description: string | null
          id: string
          owner_id: string
          place: string | null
          reason: string | null
          share_id: string
          short_summary: string
          tags: string[] | null
          time: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          owner_id?: string
          place?: string | null
          reason?: string | null
          share_id: string
          short_summary: string
          tags?: string[] | null
          time: string
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          owner_id?: string
          place?: string | null
          reason?: string | null
          share_id?: string
          short_summary?: string
          tags?: string[] | null
          time?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "shares"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          reason: string | null
          share_id: string
          short_summary: string
          tags: string[] | null
          text: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id?: string
          reason?: string | null
          share_id: string
          short_summary: string
          tags?: string[] | null
          text: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          reason?: string | null
          share_id?: string
          short_summary?: string
          tags?: string[] | null
          text?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "shares"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          created_at: string
          gender: string
          id: string
          name_or_nickname: string
          occupation: string | null
          owner_id: string
          reason: string | null
          relation_to_user: string | null
          share_id: string
          short_summary: string
          tags: string[] | null
          type: string
        }
        Insert: {
          created_at?: string
          gender: string
          id?: string
          name_or_nickname: string
          occupation?: string | null
          owner_id?: string
          reason?: string | null
          relation_to_user?: string | null
          share_id: string
          short_summary: string
          tags?: string[] | null
          type?: string
        }
        Update: {
          created_at?: string
          gender?: string
          id?: string
          name_or_nickname?: string
          occupation?: string | null
          owner_id?: string
          reason?: string | null
          relation_to_user?: string | null
          share_id?: string
          short_summary?: string
          tags?: string[] | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "shares"
            referencedColumns: ["id"]
          },
        ]
      }
      shares: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          inferred: Json | null
          inferred_type: string | null
          owner_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          inferred?: Json | null
          inferred_type?: string | null
          owner_id?: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          inferred?: Json | null
          inferred_type?: string | null
          owner_id?: string
        }
        Relationships: []
      }
      todos: {
        Row: {
          created_at: string
          due_date: string | null
          id: string
          owner_id: string
          reason: string | null
          share_id: string
          short_summary: string
          tags: string[] | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          id?: string
          owner_id?: string
          reason?: string | null
          share_id: string
          short_summary: string
          tags?: string[] | null
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          due_date?: string | null
          id?: string
          owner_id?: string
          reason?: string | null
          share_id?: string
          short_summary?: string
          tags?: string[] | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "shares"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      easy_match_shares: {
        Args: {
          query: string
          match_threshold: number
        }
        Returns: {
          id: number
          content: string
          inferred: Json
          similarity: number
          metadata: Json
        }[]
      }
      match_shares: {
        Args: {
          query_embedding: string
          match_threshold: number
        }
        Returns: {
          id: number
          content: string
          similarity: number
          metadata: Json
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  pgflow: {
    Tables: {
      deps: {
        Row: {
          flow_slug: string
          from_step_slug: string
          to_step_slug: string
        }
        Insert: {
          flow_slug: string
          from_step_slug: string
          to_step_slug: string
        }
        Update: {
          flow_slug?: string
          from_step_slug?: string
          to_step_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "deps_flow_slug_fkey"
            columns: ["flow_slug"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["flow_slug"]
          },
          {
            foreignKeyName: "deps_flow_slug_from_step_slug_fkey"
            columns: ["flow_slug", "from_step_slug"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["flow_slug", "step_slug"]
          },
          {
            foreignKeyName: "deps_flow_slug_to_step_slug_fkey"
            columns: ["flow_slug", "to_step_slug"]
            isOneToOne: false
            referencedRelation: "steps"
            referencedColumns: ["flow_slug", "step_slug"]
          },
        ]
      }
      flows: {
        Row: {
          flow_slug: string
        }
        Insert: {
          flow_slug: string
        }
        Update: {
          flow_slug?: string
        }
        Relationships: []
      }
      runs: {
        Row: {
          flow_slug: string
          payload: Json
          run_id: string
          status: string
        }
        Insert: {
          flow_slug: string
          payload: Json
          run_id: string
          status?: string
        }
        Update: {
          flow_slug?: string
          payload?: Json
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
      step_state_requests: {
        Row: {
          flow_slug: string | null
          request_id: number
          run_id: string | null
          step_slug: string | null
        }
        Insert: {
          flow_slug?: string | null
          request_id: number
          run_id?: string | null
          step_slug?: string | null
        }
        Update: {
          flow_slug?: string | null
          request_id?: number
          run_id?: string | null
          step_slug?: string | null
        }
        Relationships: []
      }
      step_states: {
        Row: {
          flow_slug: string
          run_id: string
          status: string
          step_result: Json | null
          step_slug: string
        }
        Insert: {
          flow_slug: string
          run_id: string
          status?: string
          step_result?: Json | null
          step_slug: string
        }
        Update: {
          flow_slug?: string
          run_id?: string
          status?: string
          step_result?: Json | null
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
          attempt_count: number
          flow_slug: string
          last_attempt_at: string
          max_attempts: number
          next_attempt_at: string | null
          payload: Json
          result: Json | null
          run_id: string
          status: string
          step_slug: string
        }
        Insert: {
          attempt_count?: number
          flow_slug: string
          last_attempt_at?: string
          max_attempts?: number
          next_attempt_at?: string | null
          payload: Json
          result?: Json | null
          run_id: string
          status?: string
          step_slug: string
        }
        Update: {
          attempt_count?: number
          flow_slug?: string
          last_attempt_at?: string
          max_attempts?: number
          next_attempt_at?: string | null
          payload?: Json
          result?: Json | null
          run_id?: string
          status?: string
          step_slug?: string
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
          flow_slug: string
          step_slug: string
        }
        Insert: {
          flow_slug: string
          step_slug: string
        }
        Update: {
          flow_slug?: string
          step_slug?: string
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
      complete_step: {
        Args: {
          p_run_id: string
          p_step_slug: string
          p_step_result: Json
        }
        Returns: {
          flow_slug: string
          run_id: string
          step_slug: string
          status: string
          step_result: Json
        }[]
      }
      complete_step_task: {
        Args: {
          run_id: string
          step_slug: string
          result: Json
        }
        Returns: undefined
      }
      enqueue_job: {
        Args: {
          flow_slug: string
          run_id: string
          step_slug: string
          payload: Json
        }
        Returns: undefined
      }
      enqueue_job_edge_fn: {
        Args: {
          flow_slug: string
          run_id: string
          step_slug: string
          payload: Json
        }
        Returns: undefined
      }
      enqueue_job_edge_fn_event: {
        Args: {
          flow_slug: string
          run_id: string
          step_slug: string
          payload: Json
        }
        Returns: undefined
      }
      enqueue_job_pgqueuer: {
        Args: {
          flow_slug: string
          run_id: string
          step_slug: string
          payload: Json
        }
        Returns: undefined
      }
      fail_step: {
        Args: {
          run_id: string
          step_slug: string
          error: string
        }
        Returns: {
          flow_slug: string
          returned_run_id: string
          returned_step_slug: string
          status: string
          step_result: Json
        }[]
      }
      fail_step_task: {
        Args: {
          run_id: string
          step_slug: string
          error: Json
        }
        Returns: undefined
      }
      get_root_steps: {
        Args: {
          p_flow_slug: string
        }
        Returns: {
          flow_slug: string
          step_slug: string
        }[]
      }
      has_unmet_deps: {
        Args: {
          p_run_id: string
          p_step_slug: string
        }
        Returns: boolean
      }
      is_root_step: {
        Args: {
          p_step_slug: string
        }
        Returns: boolean
      }
      retry_step_task: {
        Args: {
          run_id: string
          step_slug: string
        }
        Returns: undefined
      }
      run_flow: {
        Args: {
          p_flow_slug: string
          p_payload: Json
        }
        Returns: {
          flow_slug: string
          run_id: string
          status: string
          payload: Json
        }[]
      }
      start_step: {
        Args: {
          p_run_id: string
          p_step_slug: string
        }
        Returns: {
          flow_slug: string
          run_id: string
          status: string
          step_result: Json
        }[]
      }
      start_step_task: {
        Args: {
          run_id: string
          step_slug: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  pgflow_locks: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_steps_in_serial: {
        Args: {
          run_id: string
        }
        Returns: undefined
      }
      hash64: {
        Args: {
          input: string
        }
        Returns: number
      }
      wait_for_start_step_to_commit: {
        Args: {
          run_id: string
          step_slug: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      documents: {
        Row: {
          content: string | null
          embedding: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          content?: string | null
          embedding?: string | null
          id: string
          metadata?: Json | null
        }
        Update: {
          content?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      embeddings: {
        Row: {
          content: string | null
          document_id: string
          embedding: string
          id: string
          type: string
        }
        Insert: {
          content?: string | null
          document_id: string
          embedding: string
          id: string
          type: string
        }
        Update: {
          content?: string | null
          document_id?: string
          embedding?: string
          id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "embeddings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      pgqueuer: {
        Row: {
          created: string
          entrypoint: string
          heartbeat: string
          id: number
          payload: string | null
          priority: number
          status: Database["public"]["Enums"]["pgqueuer_status"]
          updated: string
        }
        Insert: {
          created?: string
          entrypoint: string
          heartbeat?: string
          id?: number
          payload?: string | null
          priority: number
          status: Database["public"]["Enums"]["pgqueuer_status"]
          updated?: string
        }
        Update: {
          created?: string
          entrypoint?: string
          heartbeat?: string
          id?: number
          payload?: string | null
          priority?: number
          status?: Database["public"]["Enums"]["pgqueuer_status"]
          updated?: string
        }
        Relationships: []
      }
      pgqueuer_statistics: {
        Row: {
          count: number
          created: string
          entrypoint: string
          id: number
          priority: number
          status: Database["public"]["Enums"]["pgqueuer_statistics_status"]
          time_in_queue: unknown
        }
        Insert: {
          count: number
          created?: string
          entrypoint: string
          id?: number
          priority: number
          status: Database["public"]["Enums"]["pgqueuer_statistics_status"]
          time_in_queue: unknown
        }
        Update: {
          count?: number
          created?: string
          entrypoint?: string
          id?: number
          priority?: number
          status?: Database["public"]["Enums"]["pgqueuer_statistics_status"]
          time_in_queue?: unknown
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_superadmin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      match_documents: {
        Args: {
          query_embedding: string
          match_count?: number
          match_threshold?: number
          filter?: Json
        }
        Returns: {
          id: string
          content: string
          metadata: Json
          embedding: string
          similarity: number
        }[]
      }
      match_documents_via_embeddings: {
        Args: {
          query_embedding: string
          match_count?: number
          match_threshold?: number
          filter?: Json
          type_filter?: string
        }
        Returns: {
          id: string
          content: string
          metadata: Json
          embedding: string
          document_embedding: string
          embedded_content: string
          similarity: number
        }[]
      }
    }
    Enums: {
      pgqueuer_statistics_status: "exception" | "successful" | "canceled"
      pgqueuer_status: "queued" | "picked"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_insert_object: {
        Args: {
          bucketid: string
          name: string
          owner: string
          metadata: Json
        }
        Returns: undefined
      }
      extension: {
        Args: {
          name: string
        }
        Returns: string
      }
      filename: {
        Args: {
          name: string
        }
        Returns: string
      }
      foldername: {
        Args: {
          name: string
        }
        Returns: string[]
      }
      get_size_by_bucket: {
        Args: Record<PropertyKey, never>
        Returns: {
          size: number
          bucket_id: string
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          prefix_param: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
        }
        Returns: {
          key: string
          id: string
          created_at: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          bucket_id: string
          prefix_param: string
          delimiter_param: string
          max_keys?: number
          start_after?: string
          next_token?: string
        }
        Returns: {
          name: string
          id: string
          metadata: Json
          updated_at: string
        }[]
      }
      operation: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      search: {
        Args: {
          prefix: string
          bucketname: string
          limits?: number
          levels?: number
          offsets?: number
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          name: string
          id: string
          updated_at: string
          created_at: string
          last_accessed_at: string
          metadata: Json
        }[]
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

