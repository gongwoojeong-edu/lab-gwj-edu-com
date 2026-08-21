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
      analysis_review_requests: {
        Row: {
          analysis_rate: number
          attempt_no: number
          created_at: string
          id: string
          requested_at: string
          required_filled: boolean
          responded_at: string | null
          responded_by: string | null
          response_note: string | null
          sentence_id: string
          status: Database["public"]["Enums"]["analysis_review_status"]
          track: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_rate?: number
          attempt_no?: number
          created_at?: string
          id?: string
          requested_at?: string
          required_filled?: boolean
          responded_at?: string | null
          responded_by?: string | null
          response_note?: string | null
          sentence_id: string
          status?: Database["public"]["Enums"]["analysis_review_status"]
          track?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_rate?: number
          attempt_no?: number
          created_at?: string
          id?: string
          requested_at?: string
          required_filled?: boolean
          responded_at?: string | null
          responded_by?: string | null
          response_note?: string | null
          sentence_id?: string
          status?: Database["public"]["Enums"]["analysis_review_status"]
          track?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assignments: {
        Row: {
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          include_analysis: boolean
          include_pre: boolean
          include_translation: boolean
          include_wordtest: boolean
          mem_direction:
            | Database["public"]["Enums"]["mem_direction_setting"]
            | null
          mem_include_interpret: boolean | null
          mem_include_translate: boolean | null
          round_no: number
          sentence_id: string | null
          student_id: string | null
          task_mode: Database["public"]["Enums"]["passage_task_mode"] | null
          teacher_id: string
          title: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          include_analysis?: boolean
          include_pre?: boolean
          include_translation?: boolean
          include_wordtest?: boolean
          mem_direction?:
            | Database["public"]["Enums"]["mem_direction_setting"]
            | null
          mem_include_interpret?: boolean | null
          mem_include_translate?: boolean | null
          round_no?: number
          sentence_id?: string | null
          student_id?: string | null
          task_mode?: Database["public"]["Enums"]["passage_task_mode"] | null
          teacher_id: string
          title: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          include_analysis?: boolean
          include_pre?: boolean
          include_translation?: boolean
          include_wordtest?: boolean
          mem_direction?:
            | Database["public"]["Enums"]["mem_direction_setting"]
            | null
          mem_include_interpret?: boolean | null
          mem_include_translate?: boolean | null
          round_no?: number
          sentence_id?: string | null
          student_id?: string | null
          task_mode?: Database["public"]["Enums"]["passage_task_mode"] | null
          teacher_id?: string
          title?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "textbook_units"
            referencedColumns: ["id"]
          },
        ]
      }
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
      handout_results: {
        Row: {
          created_at: string
          id: string
          is_integrated: boolean
          sentence_id: string | null
          session_no: number
          syntax_ho_result: string | null
          teacher_id: string | null
          test_date: string
          updated_at: string
          user_id: string
          word_ho_score: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_integrated?: boolean
          sentence_id?: string | null
          session_no?: number
          syntax_ho_result?: string | null
          teacher_id?: string | null
          test_date?: string
          updated_at?: string
          user_id: string
          word_ho_score?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_integrated?: boolean
          sentence_id?: string | null
          session_no?: number
          syntax_ho_result?: string | null
          teacher_id?: string | null
          test_date?: string
          updated_at?: string
          user_id?: string
          word_ho_score?: number | null
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
      import_tokens: {
        Row: {
          created_at: string
          id: string
          label: string
          last_used_at: string | null
          revoked: boolean
          teacher_id: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          revoked?: boolean
          teacher_id: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          revoked?: boolean
          teacher_id?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      level_labels: {
        Row: {
          label: string
          level: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          label: string
          level: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          label?: string
          level?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      material_view_requests: {
        Row: {
          created_at: string
          id: string
          requested_at: string
          responded_at: string | null
          responded_by: string | null
          status: string
          unit_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          requested_at?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          unit_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          requested_at?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          unit_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_view_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "textbook_units"
            referencedColumns: ["id"]
          },
        ]
      }
      memorization_recordings: {
        Row: {
          created_at: string
          duration_ms: number | null
          id: string
          mem_direction: string | null
          mime: string | null
          sentence_id: string
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          mem_direction?: string | null
          mime?: string | null
          sentence_id: string
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          mem_direction?: string | null
          mime?: string | null
          sentence_id?: string
          storage_path?: string
          user_id?: string
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
      orbit_campus_cache: {
        Row: {
          id: string
          name: string
          synced_at: string
        }
        Insert: {
          id: string
          name: string
          synced_at?: string
        }
        Update: {
          id?: string
          name?: string
          synced_at?: string
        }
        Relationships: []
      }
      orbit_staff_cache: {
        Row: {
          active: boolean
          auth_user_id: string | null
          campus_id: string | null
          campus_name: string | null
          employee_no: string | null
          id: string
          name: string
          platform_auth_user_id: string | null
          rank: number
          subjects: string[]
          synced_at: string
        }
        Insert: {
          active?: boolean
          auth_user_id?: string | null
          campus_id?: string | null
          campus_name?: string | null
          employee_no?: string | null
          id: string
          name: string
          platform_auth_user_id?: string | null
          rank?: number
          subjects?: string[]
          synced_at?: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string | null
          campus_id?: string | null
          campus_name?: string | null
          employee_no?: string | null
          id?: string
          name?: string
          platform_auth_user_id?: string | null
          rank?: number
          subjects?: string[]
          synced_at?: string
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
      paragraph_flow_progress: {
        Row: {
          attempt_count: number
          best_score: number | null
          created_at: string
          id: string
          passed_at: string | null
          unit_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          best_score?: number | null
          created_at?: string
          id?: string
          passed_at?: string | null
          unit_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          best_score?: number | null
          created_at?: string
          id?: string
          passed_at?: string | null
          unit_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paragraph_flow_progress_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "textbook_units"
            referencedColumns: ["id"]
          },
        ]
      }
      passage_audio: {
        Row: {
          created_at: string
          duration_ms: number | null
          id: string
          sentence_id: string
          source: string
          storage_path: string
          updated_at: string
          voice_label: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          sentence_id: string
          source?: string
          storage_path: string
          updated_at?: string
          voice_label?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          sentence_id?: string
          source?: string
          storage_path?: string
          updated_at?: string
          voice_label?: string | null
        }
        Relationships: []
      }
      points_log: {
        Row: {
          created_at: string
          delta: number
          id: string
          reason: string
          sentence_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          reason: string
          sentence_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          reason?: string
          sentence_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      print_requests: {
        Row: {
          created_at: string
          file_url: string | null
          handled_at: string | null
          handled_by: string | null
          id: string
          kind: string
          note: string | null
          requested_at: string
          sentence_id: string
          status: Database["public"]["Enums"]["print_request_status"]
          teacher_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_url?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          requested_at?: string
          sentence_id: string
          status?: Database["public"]["Enums"]["print_request_status"]
          teacher_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_url?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          requested_at?: string
          sentence_id?: string
          status?: Database["public"]["Enums"]["print_request_status"]
          teacher_id?: string | null
          updated_at?: string
          user_id?: string
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
      sentence_approvals: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assignment_id: string | null
          attempt_no: number
          created_at: string
          grade: string | null
          held_at: string | null
          held_by: string | null
          held_memo: string | null
          id: string
          memo: string | null
          requested_at: string
          sentence_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          assignment_id?: string | null
          attempt_no?: number
          created_at?: string
          grade?: string | null
          held_at?: string | null
          held_by?: string | null
          held_memo?: string | null
          id?: string
          memo?: string | null
          requested_at?: string
          sentence_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          assignment_id?: string | null
          attempt_no?: number
          created_at?: string
          grade?: string | null
          held_at?: string | null
          held_by?: string | null
          held_memo?: string | null
          id?: string
          memo?: string | null
          requested_at?: string
          sentence_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sentence_approvals_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      sentence_attempt_logs: {
        Row: {
          analysis_match_rate: number
          analysis_passed: boolean
          assignment_id: string | null
          attempt_no: number
          attempt_source: string
          completed_at: string
          created_at: string
          id: string
          owner_diff: Json
          sentence_id: string
          started_at: string | null
          translation_text: string | null
          user_id: string
          word_test_passed: boolean
          word_test_score: number
        }
        Insert: {
          analysis_match_rate?: number
          analysis_passed?: boolean
          assignment_id?: string | null
          attempt_no?: number
          attempt_source?: string
          completed_at?: string
          created_at?: string
          id?: string
          owner_diff?: Json
          sentence_id: string
          started_at?: string | null
          translation_text?: string | null
          user_id: string
          word_test_passed?: boolean
          word_test_score?: number
        }
        Update: {
          analysis_match_rate?: number
          analysis_passed?: boolean
          assignment_id?: string | null
          attempt_no?: number
          attempt_source?: string
          completed_at?: string
          created_at?: string
          id?: string
          owner_diff?: Json
          sentence_id?: string
          started_at?: string | null
          translation_text?: string | null
          user_id?: string
          word_test_passed?: boolean
          word_test_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "sentence_attempt_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      sentence_progress: {
        Row: {
          analysis_done: boolean
          analysis_match_rate: number | null
          assignment_id: string | null
          created_at: string
          id: string
          last_activity_at: string | null
          last_grade: string | null
          last_memo: string | null
          last_redo_memo: string | null
          mem_attempt_count: number
          mem_cloze_done: boolean
          mem_dictation_done: boolean
          mem_dictation_score: number | null
          mem_direction: string | null
          mem_en_to_ko_done: boolean
          mem_interpret_done: boolean
          mem_interpret_score: number | null
          mem_ko_to_en_done: boolean
          mem_listen_done: boolean
          mem_passed_at: string | null
          mem_record_done: boolean
          mem_scramble_done: boolean
          mem_speech_done: boolean
          mem_translate_done: boolean
          mem_translate_score: number | null
          passed_at: string | null
          pre_done: boolean
          redo_requested_at: string | null
          sentence_id: string
          status: string
          translation_done: boolean
          updated_at: string
          user_id: string | null
          word_test_done: boolean
        }
        Insert: {
          analysis_done?: boolean
          analysis_match_rate?: number | null
          assignment_id?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string | null
          last_grade?: string | null
          last_memo?: string | null
          last_redo_memo?: string | null
          mem_attempt_count?: number
          mem_cloze_done?: boolean
          mem_dictation_done?: boolean
          mem_dictation_score?: number | null
          mem_direction?: string | null
          mem_en_to_ko_done?: boolean
          mem_interpret_done?: boolean
          mem_interpret_score?: number | null
          mem_ko_to_en_done?: boolean
          mem_listen_done?: boolean
          mem_passed_at?: string | null
          mem_record_done?: boolean
          mem_scramble_done?: boolean
          mem_speech_done?: boolean
          mem_translate_done?: boolean
          mem_translate_score?: number | null
          passed_at?: string | null
          pre_done?: boolean
          redo_requested_at?: string | null
          sentence_id: string
          status?: string
          translation_done?: boolean
          updated_at?: string
          user_id?: string | null
          word_test_done?: boolean
        }
        Update: {
          analysis_done?: boolean
          analysis_match_rate?: number | null
          assignment_id?: string | null
          created_at?: string
          id?: string
          last_activity_at?: string | null
          last_grade?: string | null
          last_memo?: string | null
          last_redo_memo?: string | null
          mem_attempt_count?: number
          mem_cloze_done?: boolean
          mem_dictation_done?: boolean
          mem_dictation_score?: number | null
          mem_direction?: string | null
          mem_en_to_ko_done?: boolean
          mem_interpret_done?: boolean
          mem_interpret_score?: number | null
          mem_ko_to_en_done?: boolean
          mem_listen_done?: boolean
          mem_passed_at?: string | null
          mem_record_done?: boolean
          mem_scramble_done?: boolean
          mem_speech_done?: boolean
          mem_translate_done?: boolean
          mem_translate_score?: number | null
          passed_at?: string | null
          pre_done?: boolean
          redo_requested_at?: string | null
          sentence_id?: string
          status?: string
          translation_done?: boolean
          updated_at?: string
          user_id?: string | null
          word_test_done?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sentence_progress_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
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
      sentence_word_extractions: {
        Row: {
          created_at: string
          english: string
          model: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sentence_id: string
          updated_at: string
          words: Json
        }
        Insert: {
          created_at?: string
          english: string
          model?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sentence_id: string
          updated_at?: string
          words?: Json
        }
        Update: {
          created_at?: string
          english?: string
          model?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sentence_id?: string
          updated_at?: string
          words?: Json
        }
        Relationships: []
      }
      student_notifications: {
        Row: {
          approval_id: string | null
          body: string | null
          created_at: string
          grade: string | null
          id: string
          kind: string
          read_at: string | null
          sent_by: string | null
          sentence_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_id?: string | null
          body?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          sent_by?: string | null
          sentence_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_id?: string | null
          body?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          sent_by?: string | null
          sentence_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      student_passage_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          sentence_id: string
          skip_pre: boolean
          task_mode: Database["public"]["Enums"]["passage_task_mode"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          sentence_id: string
          skip_pre?: boolean
          task_mode?: Database["public"]["Enums"]["passage_task_mode"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          sentence_id?: string
          skip_pre?: boolean
          task_mode?: Database["public"]["Enums"]["passage_task_mode"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      student_profiles: {
        Row: {
          access_level: string | null
          actual_grade: string | null
          analysis_pass_threshold: number
          best_streak: number
          campus: string | null
          created_at: string
          current_level: string
          current_no: number
          current_streak: number
          display_name: string | null
          enrolled_since: string | null
          grade_unlock: string[] | null
          hint_mode_enabled: boolean
          homeroom_teacher_id: string | null
          notes: string | null
          orbit_class_days: string[] | null
          orbit_class_id: string | null
          orbit_class_name: string | null
          orbit_class_schedule: Json | null
          orbit_enrollment_active: boolean
          points: number
          school_name: string | null
          start_level: string
          start_series_id: string | null
          start_unit_id: string | null
          start_volume_id: string | null
          student_no: string
          teacher_id: string | null
          teacher_pin: string | null
          textbook_publisher: string | null
          unit_workbook_mode: string
          updated_at: string
          user_id: string
          word_test_pass_threshold: number
          word_test_time_limit_sec: number
        }
        Insert: {
          access_level?: string | null
          actual_grade?: string | null
          analysis_pass_threshold?: number
          best_streak?: number
          campus?: string | null
          created_at?: string
          current_level?: string
          current_no?: number
          current_streak?: number
          display_name?: string | null
          enrolled_since?: string | null
          grade_unlock?: string[] | null
          hint_mode_enabled?: boolean
          homeroom_teacher_id?: string | null
          notes?: string | null
          orbit_class_days?: string[] | null
          orbit_class_id?: string | null
          orbit_class_name?: string | null
          orbit_class_schedule?: Json | null
          orbit_enrollment_active?: boolean
          points?: number
          school_name?: string | null
          start_level?: string
          start_series_id?: string | null
          start_unit_id?: string | null
          start_volume_id?: string | null
          student_no: string
          teacher_id?: string | null
          teacher_pin?: string | null
          textbook_publisher?: string | null
          unit_workbook_mode?: string
          updated_at?: string
          user_id: string
          word_test_pass_threshold?: number
          word_test_time_limit_sec?: number
        }
        Update: {
          access_level?: string | null
          actual_grade?: string | null
          analysis_pass_threshold?: number
          best_streak?: number
          campus?: string | null
          created_at?: string
          current_level?: string
          current_no?: number
          current_streak?: number
          display_name?: string | null
          enrolled_since?: string | null
          grade_unlock?: string[] | null
          hint_mode_enabled?: boolean
          homeroom_teacher_id?: string | null
          notes?: string | null
          orbit_class_days?: string[] | null
          orbit_class_id?: string | null
          orbit_class_name?: string | null
          orbit_class_schedule?: Json | null
          orbit_enrollment_active?: boolean
          points?: number
          school_name?: string | null
          start_level?: string
          start_series_id?: string | null
          start_unit_id?: string | null
          start_volume_id?: string | null
          student_no?: string
          teacher_id?: string | null
          teacher_pin?: string | null
          textbook_publisher?: string | null
          unit_workbook_mode?: string
          updated_at?: string
          user_id?: string
          word_test_pass_threshold?: number
          word_test_time_limit_sec?: number
        }
        Relationships: []
      }
      textbook_passages: {
        Row: {
          analysis_status: string
          code: string
          created_at: string
          english: string
          id: string
          korean: string | null
          korean_source: string | null
          mem_cloze_spec: Json | null
          mem_composed_at: string | null
          mem_korean_chunks: Json | null
          mem_status: Database["public"]["Enums"]["passage_mem_status"]
          mem_tokens: Json | null
          passage_no: number
          task_mode: Database["public"]["Enums"]["passage_task_mode"] | null
          textbook_id: string
          tokens: Json | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          analysis_status?: string
          code: string
          created_at?: string
          english: string
          id?: string
          korean?: string | null
          korean_source?: string | null
          mem_cloze_spec?: Json | null
          mem_composed_at?: string | null
          mem_korean_chunks?: Json | null
          mem_status?: Database["public"]["Enums"]["passage_mem_status"]
          mem_tokens?: Json | null
          passage_no: number
          task_mode?: Database["public"]["Enums"]["passage_task_mode"] | null
          textbook_id: string
          tokens?: Json | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          analysis_status?: string
          code?: string
          created_at?: string
          english?: string
          id?: string
          korean?: string | null
          korean_source?: string | null
          mem_cloze_spec?: Json | null
          mem_composed_at?: string | null
          mem_korean_chunks?: Json | null
          mem_status?: Database["public"]["Enums"]["passage_mem_status"]
          mem_tokens?: Json | null
          passage_no?: number
          task_mode?: Database["public"]["Enums"]["passage_task_mode"] | null
          textbook_id?: string
          tokens?: Json | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "textbook_passages_textbook_id_fkey"
            columns: ["textbook_id"]
            isOneToOne: false
            referencedRelation: "textbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "textbook_passages_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "textbook_units"
            referencedColumns: ["id"]
          },
        ]
      }
      textbook_series: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          level: string
          series_no: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          level: string
          series_no: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          level?: string
          series_no?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      textbook_units: {
        Row: {
          analysis_pdf_name: string | null
          analysis_pdf_uploaded_at: string | null
          analysis_pdf_url: string | null
          created_at: string
          created_by: string | null
          default_mem_direction: Database["public"]["Enums"]["mem_direction_setting"]
          default_task_mode: Database["public"]["Enums"]["passage_task_mode"]
          description: string | null
          id: string
          mem_dictation_blank_ratio: number
          mem_dictation_min_score: number
          mem_include_interpret: boolean
          mem_include_translate: boolean
          mem_require_record: boolean
          structure_pdf_name: string | null
          structure_pdf_uploaded_at: string | null
          structure_pdf_url: string | null
          textbook_id: string
          title: string
          unit_no: number
          updated_at: string
        }
        Insert: {
          analysis_pdf_name?: string | null
          analysis_pdf_uploaded_at?: string | null
          analysis_pdf_url?: string | null
          created_at?: string
          created_by?: string | null
          default_mem_direction?: Database["public"]["Enums"]["mem_direction_setting"]
          default_task_mode?: Database["public"]["Enums"]["passage_task_mode"]
          description?: string | null
          id?: string
          mem_dictation_blank_ratio?: number
          mem_dictation_min_score?: number
          mem_include_interpret?: boolean
          mem_include_translate?: boolean
          mem_require_record?: boolean
          structure_pdf_name?: string | null
          structure_pdf_uploaded_at?: string | null
          structure_pdf_url?: string | null
          textbook_id: string
          title: string
          unit_no: number
          updated_at?: string
        }
        Update: {
          analysis_pdf_name?: string | null
          analysis_pdf_uploaded_at?: string | null
          analysis_pdf_url?: string | null
          created_at?: string
          created_by?: string | null
          default_mem_direction?: Database["public"]["Enums"]["mem_direction_setting"]
          default_task_mode?: Database["public"]["Enums"]["passage_task_mode"]
          description?: string | null
          id?: string
          mem_dictation_blank_ratio?: number
          mem_dictation_min_score?: number
          mem_include_interpret?: boolean
          mem_include_translate?: boolean
          mem_require_record?: boolean
          structure_pdf_name?: string | null
          structure_pdf_uploaded_at?: string | null
          structure_pdf_url?: string | null
          textbook_id?: string
          title?: string
          unit_no?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "textbook_units_textbook_id_fkey"
            columns: ["textbook_id"]
            isOneToOne: false
            referencedRelation: "textbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      textbooks: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          level: string
          series_id: string
          title: string
          unit_no: number
          updated_at: string
          volume_no: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          level: string
          series_id: string
          title: string
          unit_no: number
          updated_at?: string
          volume_no: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          level?: string
          series_id?: string
          title?: string
          unit_no?: number
          updated_at?: string
          volume_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "textbooks_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "textbook_series"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_workflows: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          print_requested_at: string | null
          printed_at: string | null
          printed_by: string | null
          status: Database["public"]["Enums"]["unit_workflow_status"]
          teacher_grade: string | null
          teacher_memo: string | null
          unit_id: string
          updated_at: string
          user_id: string
          workbook_submitted_at: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          print_requested_at?: string | null
          printed_at?: string | null
          printed_by?: string | null
          status?: Database["public"]["Enums"]["unit_workflow_status"]
          teacher_grade?: string | null
          teacher_memo?: string | null
          unit_id: string
          updated_at?: string
          user_id: string
          workbook_submitted_at?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          print_requested_at?: string | null
          printed_at?: string | null
          printed_by?: string | null
          status?: Database["public"]["Enums"]["unit_workflow_status"]
          teacher_grade?: string | null
          teacher_memo?: string | null
          unit_id?: string
          updated_at?: string
          user_id?: string
          workbook_submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unit_workflows_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "textbook_units"
            referencedColumns: ["id"]
          },
        ]
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
          assist_log: Json
          completed: boolean
          id: string
          known_words: string[]
          sentence_id: string
          taken_at: string
          unknown_words: string[]
          user_id: string | null
        }
        Insert: {
          assist_log?: Json
          completed?: boolean
          id?: string
          known_words?: string[]
          sentence_id: string
          taken_at?: string
          unknown_words?: string[]
          user_id?: string | null
        }
        Update: {
          assist_log?: Json
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
          attempt_no: number
          id: string
          items: Json
          mode: string
          passed: boolean
          remediation_done: boolean
          score: number
          sentence_id: string
          taken_at: string
          user_id: string | null
          wrong_words: Json
        }
        Insert: {
          attempt_no?: number
          id?: string
          items: Json
          mode?: string
          passed: boolean
          remediation_done?: boolean
          score: number
          sentence_id: string
          taken_at?: string
          user_id?: string | null
          wrong_words?: Json
        }
        Update: {
          attempt_no?: number
          id?: string
          items?: Json
          mode?: string
          passed?: boolean
          remediation_done?: boolean
          score?: number
          sentence_id?: string
          taken_at?: string
          user_id?: string | null
          wrong_words?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      class_kpis_today: {
        Args: never
        Returns: {
          active_today: number
          avg_integrated_today: number
          pass_sentences_today: number
          total_students: number
          weekly_active_students: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_session_no: {
        Args: { p_test_date: string; p_user_id: string }
        Returns: number
      }
      upsert_cron_secret: { Args: { p_secret: string }; Returns: undefined }
    }
    Enums: {
      analysis_review_status: "pending" | "approved" | "rejected" | "cancelled"
      app_role: "student" | "teacher" | "admin"
      mem_direction_setting: "ko_to_en" | "en_to_ko" | "both"
      passage_mem_status: "draft" | "ready"
      passage_task_mode:
        | "analysis_only"
        | "memorize_only"
        | "analysis_and_memorize"
      print_request_status: "pending" | "printed" | "canceled"
      unit_workflow_status:
        | "learning"
        | "print_pending"
        | "printed"
        | "workbook_submitted"
        | "completed"
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
      analysis_review_status: ["pending", "approved", "rejected", "cancelled"],
      app_role: ["student", "teacher", "admin"],
      mem_direction_setting: ["ko_to_en", "en_to_ko", "both"],
      passage_mem_status: ["draft", "ready"],
      passage_task_mode: [
        "analysis_only",
        "memorize_only",
        "analysis_and_memorize",
      ],
      print_request_status: ["pending", "printed", "canceled"],
      unit_workflow_status: [
        "learning",
        "print_pending",
        "printed",
        "workbook_submitted",
        "completed",
      ],
    },
  },
} as const
