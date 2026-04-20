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
      badge_offsets: {
        Row: {
          dx: number
          id: string
          owner_id: string
          sentence_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          dx?: number
          id?: string
          owner_id: string
          sentence_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          dx?: number
          id?: string
          owner_id?: string
          sentence_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      idioms: {
        Row: {
          created_at: string
          id: string
          indices: number[]
          meaning: string
          sentence_id: string
          surface: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          indices: number[]
          meaning: string
          sentence_id: string
          surface: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          indices?: number[]
          meaning?: string
          sentence_id?: string
          surface?: string
          user_id?: string | null
        }
        Relationships: []
      }
      modifier_relations: {
        Row: {
          created_at: string
          id: string
          sentence_id: string
          source_owner_id: string
          target_owner_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          sentence_id: string
          source_owner_id: string
          target_owner_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          sentence_id?: string
          source_owner_id?: string
          target_owner_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      owner_progress: {
        Row: {
          completed: boolean
          created_at: string
          custom_answer: Json | null
          id: string
          owner_id: string
          progress: Json | null
          sentence_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          completed?: boolean
          created_at?: string
          custom_answer?: Json | null
          id?: string
          owner_id: string
          progress?: Json | null
          sentence_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          completed?: boolean
          created_at?: string
          custom_answer?: Json | null
          id?: string
          owner_id?: string
          progress?: Json | null
          sentence_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      referent_relations: {
        Row: {
          created_at: string
          id: string
          sentence_id: string
          source_owner_id: string
          target_owner_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          sentence_id: string
          source_owner_id: string
          target_owner_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          sentence_id?: string
          source_owner_id?: string
          target_owner_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sentence_progress: {
        Row: {
          analysis_done: boolean
          created_at: string
          id: string
          passed_at: string | null
          pre_done: boolean
          sentence_id: string
          status: string
          translation_done: boolean
          updated_at: string
          user_id: string | null
          word_test_done: boolean
        }
        Insert: {
          analysis_done?: boolean
          created_at?: string
          id?: string
          passed_at?: string | null
          pre_done?: boolean
          sentence_id: string
          status?: string
          translation_done?: boolean
          updated_at?: string
          user_id?: string | null
          word_test_done?: boolean
        }
        Update: {
          analysis_done?: boolean
          created_at?: string
          id?: string
          passed_at?: string | null
          pre_done?: boolean
          sentence_id?: string
          status?: string
          translation_done?: boolean
          updated_at?: string
          user_id?: string | null
          word_test_done?: boolean
        }
        Relationships: []
      }
      sentence_translations: {
        Row: {
          id: string
          sentence_id: string
          submitted_at: string
          text: string
          user_id: string | null
        }
        Insert: {
          id?: string
          sentence_id: string
          submitted_at?: string
          text: string
          user_id?: string | null
        }
        Update: {
          id?: string
          sentence_id?: string
          submitted_at?: string
          text?: string
          user_id?: string | null
        }
        Relationships: []
      }
      student_profiles: {
        Row: {
          created_at: string
          current_level: string
          current_no: number
          display_name: string | null
          start_level: string
          student_no: string
          teacher_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_level?: string
          current_no?: number
          display_name?: string | null
          start_level?: string
          student_no: string
          teacher_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_level?: string
          current_no?: number
          display_name?: string | null
          start_level?: string
          student_no?: string
          teacher_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sentences: {
        Row: {
          code: string | null
          created_at: string
          id: string
          level: string | null
          text: string
          user_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          level?: string | null
          text: string
          user_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          level?: string | null
          text?: string
          user_id?: string | null
        }
        Relationships: []
      }
      word_pre_results: {
        Row: {
          completed: boolean
          id: string
          known_words: string[]
          sentence_id: string
          taken_at: string
          unknown_words: string[]
          user_id: string | null
        }
        Insert: {
          completed?: boolean
          id?: string
          known_words?: string[]
          sentence_id: string
          taken_at?: string
          unknown_words?: string[]
          user_id?: string | null
        }
        Update: {
          completed?: boolean
          id?: string
          known_words?: string[]
          sentence_id?: string
          taken_at?: string
          unknown_words?: string[]
          user_id?: string | null
        }
        Relationships: []
      }
      word_test_results: {
        Row: {
          id: string
          items: Json
          passed: boolean
          score: number
          sentence_id: string
          taken_at: string
          user_id: string | null
        }
        Insert: {
          id?: string
          items: Json
          passed: boolean
          score: number
          sentence_id: string
          taken_at?: string
          user_id?: string | null
        }
        Update: {
          id?: string
          items?: Json
          passed?: boolean
          score?: number
          sentence_id?: string
          taken_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "student" | "teacher" | "admin"
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
  public: {
    Enums: {
      app_role: ["student", "teacher", "admin"],
    },
  },
} as const
