export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1";
  };
  public: {
    Tables: {
      feedback_entries: {
        Row: {
          content: string;
          created_at: string | null;
          id: string;
          project_id: string | null;
          source: string;
          upload_id: string | null;
          user_id: string | null;
        };
        Insert: {
          content: string;
          created_at?: string | null;
          id?: string;
          project_id?: string | null;
          source: string;
          upload_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string | null;
          id?: string;
          project_id?: string | null;
          source?: string;
          upload_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_entries_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "feedback_entries_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          created_at: string | null;
          id: string;
          name: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          name: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          name?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      run_deltas: {
        Row: {
          created_at: string | null;
          current_run_id: string;
          id: string;
          improving: Json;
          new_problems: Json;
          previous_run_id: string;
          project_id: string;
          resolved: Json;
          user_id: string;
          worsening: Json;
        };
        Insert: {
          created_at?: string | null;
          current_run_id: string;
          id?: string;
          improving?: Json;
          new_problems?: Json;
          previous_run_id: string;
          project_id: string;
          resolved?: Json;
          user_id: string;
          worsening?: Json;
        };
        Update: {
          created_at?: string | null;
          current_run_id?: string;
          id?: string;
          improving?: Json;
          new_problems?: Json;
          previous_run_id?: string;
          project_id?: string;
          resolved?: Json;
          user_id?: string;
          worsening?: Json;
        };
        Relationships: [];
      };
      run_features: {
        Row: {
          created_at: string | null;
          dominant_problem: string | null;
          feature: string;
          id: string;
          mention_count: number;
          run_id: string;
        };
        Insert: {
          created_at?: string | null;
          dominant_problem?: string | null;
          feature: string;
          id?: string;
          mention_count?: number;
          run_id: string;
        };
        Update: {
          created_at?: string | null;
          dominant_problem?: string | null;
          feature?: string;
          id?: string;
          mention_count?: number;
          run_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "run_features_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
        ];
      };
      run_memos: {
        Row: {
          content: string;
          created_at: string | null;
          id: string;
          project_id: string;
          run_id: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string | null;
          id?: string;
          project_id: string;
          run_id: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string | null;
          id?: string;
          project_id?: string;
          run_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      run_problem_actions: {
        Row: {
          created_at: string | null;
          expected_impact: string | null;
          first_check: string | null;
          id: string;
          owner_guess: string | null;
          problem_id: string;
          run_id: string;
          suggested_action: string | null;
        };
        Insert: {
          created_at?: string | null;
          expected_impact?: string | null;
          first_check?: string | null;
          id?: string;
          owner_guess?: string | null;
          problem_id: string;
          run_id: string;
          suggested_action?: string | null;
        };
        Update: {
          created_at?: string | null;
          expected_impact?: string | null;
          first_check?: string | null;
          id?: string;
          owner_guess?: string | null;
          problem_id?: string;
          run_id?: string;
          suggested_action?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "run_problem_actions_problem_id_fkey";
            columns: ["problem_id"];
            isOneToOne: false;
            referencedRelation: "run_problems";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "run_problem_actions_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
        ];
      };
      run_problem_entries: {
        Row: {
          created_at: string | null;
          feedback_entry_id: string;
          problem_id: string;
        };
        Insert: {
          created_at?: string | null;
          feedback_entry_id: string;
          problem_id: string;
        };
        Update: {
          created_at?: string | null;
          feedback_entry_id?: string;
          problem_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "run_problem_entries_feedback_entry_id_fkey";
            columns: ["feedback_entry_id"];
            isOneToOne: false;
            referencedRelation: "feedback_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "run_problem_entries_problem_id_fkey";
            columns: ["problem_id"];
            isOneToOne: false;
            referencedRelation: "run_problems";
            referencedColumns: ["id"];
          },
        ];
      };
      run_problems: {
        Row: {
          created_at: string;
          id: string;
          mention_count: number;
          quotes: Json;
          rank: number;
          run_id: string;
          sources: string[];
          summary: string | null;
          title: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mention_count?: number;
          quotes?: Json;
          rank: number;
          run_id: string;
          sources?: string[];
          summary?: string | null;
          title: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mention_count?: number;
          quotes?: Json;
          rank?: number;
          run_id?: string;
          sources?: string[];
          summary?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "run_problems_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "runs";
            referencedColumns: ["id"];
          },
        ];
      };
      runs: {
        Row: {
          created_at: string;
          entry_count: number;
          id: string;
          label: string | null;
          project_id: string;
          scope: string;
          source_filter: string;
          status: string;
          upload_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          entry_count?: number;
          id?: string;
          label?: string | null;
          project_id: string;
          scope: string;
          source_filter: string;
          status: string;
          upload_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          entry_count?: number;
          id?: string;
          label?: string | null;
          project_id?: string;
          scope?: string;
          source_filter?: string;
          status?: string;
          upload_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "runs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "runs_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          created_at: string | null;
          current_period_end: string | null;
          current_period_start: string | null;
          id: string;
          lemon_customer_id: string | null;
          lemon_subscription_id: string | null;
          plan: string;
          status: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          lemon_customer_id?: string | null;
          lemon_subscription_id?: string | null;
          plan: string;
          status: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          lemon_customer_id?: string | null;
          lemon_subscription_id?: string | null;
          plan?: string;
          status?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      uploads: {
        Row: {
          created_at: string | null;
          id: string;
          original_filename: string | null;
          project_id: string | null;
          source: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          original_filename?: string | null;
          project_id?: string | null;
          source: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          original_filename?: string | null;
          project_id?: string | null;
          source?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "uploads_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
