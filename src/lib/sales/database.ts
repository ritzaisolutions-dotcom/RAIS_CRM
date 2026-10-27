import type {
  Abbruchgrund,
  CallListeRow,
  Company,
  CrmSystem,
  CustomFieldDef,
  CustomFieldValue,
  EmailTemplate,
  MitarbeiterKlasse,
  MonitoredSystem,
  Opportunity,
  OppStage,
  OppVariante,
  Person,
  PipelineStatus,
  SalesTask,
  SavedView,
  Sequence,
  SequenceEnrollment,
  SequenceKanal,
  SequenceStep,
  SystemCheck,
  SystemKind,
  SystemStatusRow,
  TouchErgebnis,
  TouchKanal,
  Touchpoint,
  WorkflowRule,
} from "@/lib/sales/types";

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TableDef<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type EmailMessage = {
  id: string;
  company_id: string;
  person_id: string | null;
  template_id: string | null;
  direction: "outbound" | "inbound";
  to_email: string;
  subject: string;
  body: string;
  status: "queued" | "sent" | "failed" | "received";
  provider_ref: string | null;
  error: string | null;
  created_at: string;
  created_by: string | null;
};

type SmsMessage = {
  id: string;
  company_id: string;
  person_id: string | null;
  direction: "outbound" | "inbound";
  to_phone: string;
  body: string;
  status: "queued" | "sent" | "failed" | "received";
  provider_ref: string | null;
  error: string | null;
  created_at: string;
  created_by: string | null;
};

export type Database = {
  sales: {
    Tables: {
      companies: TableDef<
        Company,
        {
          name: string;
          stadt?: string | null;
          website?: string | null;
          instagram_url?: string | null;
          facebook_url?: string | null;
          linkedin_url?: string | null;
          telefon?: string | null;
          mitarbeiterzahl?: MitarbeiterKlasse | null;
          crm_system?: CrmSystem | null;
          anfragen_pro_woche?: number | null;
          inserate_aktiv?: number | null;
          meta_ads?: boolean | null;
          recherche?: string | null;
          pipeline_status?: PipelineStatus;
        },
        {
          name?: string;
          stadt?: string | null;
          telefon?: string | null;
          mitarbeiterzahl?: MitarbeiterKlasse | null;
          crm_system?: CrmSystem | null;
          anfragen_pro_woche?: number | null;
          recherche?: string | null;
          website?: string | null;
          instagram_url?: string | null;
          facebook_url?: string | null;
          linkedin_url?: string | null;
          inserate_aktiv?: number | null;
          meta_ads?: boolean | null;
        }
      >;
      people: TableDef<
        Person,
        {
          company_id: string;
          name: string;
          rolle?: string | null;
          email?: string | null;
          telefon?: string | null;
          linkedin_url?: string | null;
          ist_entscheider?: boolean;
        },
        {
          name?: string;
          rolle?: string | null;
          email?: string | null;
          telefon?: string | null;
          linkedin_url?: string | null;
          ist_entscheider?: boolean;
        }
      >;
      touchpoints: TableDef<
        Touchpoint,
        {
          company_id: string;
          person_id?: string | null;
          kanal: TouchKanal;
          ergebnis: TouchErgebnis;
          abbruchgrund?: Abbruchgrund | null;
          notiz?: string | null;
          naechster_touch?: string | null;
          occurred_at?: string;
        },
        Record<string, never>
      >;
      opportunities: TableDef<
        Opportunity,
        {
          company_id: string;
          variante: OppVariante;
          setup_preis?: number | null;
          retainer_monatlich?: number | null;
          stage?: OppStage;
          close_grund?: string | null;
          closed_at?: string | null;
          titel?: string | null;
          erwarteter_umsatz?: number | null;
        },
        {
          variante?: OppVariante;
          setup_preis?: number | null;
          retainer_monatlich?: number | null;
          stage?: OppStage;
          close_grund?: string | null;
          closed_at?: string | null;
          titel?: string | null;
          erwarteter_umsatz?: number | null;
        }
      >;
      tasks: TableDef<
        SalesTask,
        {
          company_id: string;
          person_id?: string | null;
          titel: string;
          notiz?: string | null;
          due_on: string;
          status?: SalesTask["status"];
          art?: SalesTask["art"];
          email_preset?: SalesTask["email_preset"];
          created_by?: string | null;
        },
        {
          status?: SalesTask["status"];
          completed_at?: string | null;
          titel?: string;
          notiz?: string | null;
          due_on?: string;
          art?: SalesTask["art"];
          email_preset?: SalesTask["email_preset"];
        }
      >;
      custom_field_defs: TableDef<
        CustomFieldDef & { options: unknown },
        {
          name: string;
          slug: string;
          field_type: CustomFieldDef["field_type"];
          options?: unknown;
          active?: boolean;
          sort_order?: number;
          created_by?: string | null;
        },
        {
          name?: string;
          slug?: string;
          field_type?: CustomFieldDef["field_type"];
          options?: unknown;
          active?: boolean;
          sort_order?: number;
        }
      >;
      custom_field_values: TableDef<
        CustomFieldValue & { updated_at?: string },
        {
          company_id: string;
          field_id: string;
          value_text?: string | null;
          value_number?: number | null;
          value_json?: unknown;
          updated_at?: string;
        },
        {
          value_text?: string | null;
          value_number?: number | null;
          value_json?: unknown;
          updated_at?: string;
        }
      >;
      app_settings: TableDef<
        { key: string; value: unknown; updated_at: string },
        { key: string; value?: unknown; updated_at?: string },
        { value?: unknown; updated_at?: string }
      >;
      inbound_email_quarantine: TableDef<
        {
          id: string;
          provider_ref: string;
          from_email: string | null;
          subject: string | null;
          body: string | null;
          received_at: string;
          resolved_at: string | null;
          resolved_company_id: string | null;
          created_at: string;
        },
        {
          provider_ref: string;
          from_email?: string | null;
          subject?: string | null;
          body?: string | null;
          received_at?: string;
          resolved_at?: string | null;
          resolved_company_id?: string | null;
        },
        {
          resolved_at?: string | null;
          resolved_company_id?: string | null;
          from_email?: string | null;
          subject?: string | null;
          body?: string | null;
        }
      >;
      email_templates: TableDef<
        EmailTemplate,
        {
          name: string;
          subject: string;
          body: string;
          created_by?: string | null;
        },
        {
          name?: string;
          subject?: string;
          body?: string;
          updated_at?: string;
        }
      >;
      email_messages: TableDef<
        EmailMessage,
        {
          company_id: string;
          person_id?: string | null;
          template_id?: string | null;
          direction?: EmailMessage["direction"];
          to_email: string;
          subject: string;
          body: string;
          status?: EmailMessage["status"];
          provider_ref?: string | null;
          error?: string | null;
          created_by?: string | null;
        },
        {
          status?: EmailMessage["status"];
          provider_ref?: string | null;
          error?: string | null;
        }
      >;
      sms_messages: TableDef<
        SmsMessage,
        {
          company_id: string;
          person_id?: string | null;
          direction?: SmsMessage["direction"];
          to_phone: string;
          body: string;
          status?: SmsMessage["status"];
          provider_ref?: string | null;
          error?: string | null;
          created_by?: string | null;
        },
        {
          status?: SmsMessage["status"];
          provider_ref?: string | null;
          error?: string | null;
        }
      >;
      sequences: TableDef<
        Sequence,
        {
          name: string;
          active?: boolean;
          created_by?: string | null;
        },
        {
          name?: string;
          active?: boolean;
        }
      >;
      sequence_steps: TableDef<
        SequenceStep,
        {
          sequence_id: string;
          step_order: number;
          kanal: SequenceKanal;
          delay_days?: number;
          subject?: string | null;
          body?: string | null;
          task_titel?: string | null;
        },
        {
          step_order?: number;
          kanal?: SequenceKanal;
          delay_days?: number;
          subject?: string | null;
          body?: string | null;
          task_titel?: string | null;
        }
      >;
      sequence_enrollments: TableDef<
        SequenceEnrollment,
        {
          sequence_id: string;
          company_id: string;
          person_id?: string | null;
          status?: SequenceEnrollment["status"];
          current_step?: number;
          next_run_on?: string | null;
          stop_reason?: string | null;
          created_by?: string | null;
        },
        {
          status?: SequenceEnrollment["status"];
          current_step?: number;
          next_run_on?: string | null;
          stop_reason?: string | null;
        }
      >;
      workflow_rules: TableDef<
        WorkflowRule,
        {
          name: string;
          active?: boolean;
          trigger_pipeline_status: PipelineStatus;
          action_type?: "create_task";
          task_titel: string;
          task_due_days?: number;
          created_by?: string | null;
        },
        {
          name?: string;
          active?: boolean;
          trigger_pipeline_status?: PipelineStatus;
          task_titel?: string;
          task_due_days?: number;
        }
      >;
      saved_views: TableDef<
        SavedView,
        {
          name: string;
          scope?: SavedView["scope"];
          filters?: SavedView["filters"];
          created_by?: string | null;
        },
        {
          name?: string;
          scope?: SavedView["scope"];
          filters?: SavedView["filters"];
        }
      >;
      lead_lists: TableDef<
        {
          id: string;
          name: string;
          sort_order: number;
          created_at: string;
          created_by: string | null;
        },
        {
          name: string;
          sort_order?: number;
          created_by?: string | null;
        },
        {
          name?: string;
          sort_order?: number;
        }
      >;
      lead_list_members: TableDef<
        {
          list_id: string;
          company_id: string;
          added_at: string;
          added_by: string | null;
        },
        {
          list_id: string;
          company_id: string;
          added_by?: string | null;
        },
        Record<string, never>
      >;
      systems: TableDef<
        MonitoredSystem,
        {
          code: string;
          name: string;
          company_id: string;
          kind: SystemKind;
          project_url?: string | null;
          vercel_project_id?: string | null;
          github_repo?: string | null;
          n8n_workflow_ids?: string[];
          supabase_ref?: string | null;
          active?: boolean;
        },
        {
          name?: string;
          company_id?: string;
          kind?: SystemKind;
          project_url?: string | null;
          vercel_project_id?: string | null;
          github_repo?: string | null;
          n8n_workflow_ids?: string[];
          supabase_ref?: string | null;
          active?: boolean;
        }
      >;
      system_checks: TableDef<
        SystemCheck,
        {
          system_code: string;
          check_kind: string;
          checked_at?: string;
          result: SystemCheck["result"];
          duration_ms?: number | null;
          message?: string | null;
          action?: string | null;
        },
        never
      >;
    };
    Views: {
      v_call_liste: {
        Row: CallListeRow;
        Relationships: [];
      };
      v_termine_liste: {
        Row: CallListeRow;
        Relationships: [];
      };
      v_kunden_liste: {
        Row: CallListeRow;
        Relationships: [];
      };
      v_call_liste_by_list: {
        Row: CallListeRow & { list_id: string };
        Relationships: [];
      };
      v_termine_liste_by_list: {
        Row: CallListeRow & { list_id: string };
        Relationships: [];
      };
      v_open_tasks: {
        Row: SalesTask;
        Relationships: [];
      };
      v_system_status: {
        Row: SystemStatusRow;
        Relationships: [];
      };
    };
    Functions: {
      is_app_user: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      log_touch: {
        Args: {
          p_company_id: string;
          p_kanal: TouchKanal;
          p_ergebnis?: TouchErgebnis;
          p_person_id?: string | null;
          p_notiz?: string | null;
          p_naechster?: string | null;
          p_abbruch?: Abbruchgrund | null;
          p_source_key?: string | null;
        };
        Returns: number;
      };
      void_touch: {
        Args: {
          p_touch_id: number;
          p_grund?: string | null;
        };
        Returns: undefined;
      };
      business_today: {
        Args: Record<string, never>;
        Returns: string;
      };
      create_company: {
        Args: {
          p_name: string;
          p_stadt?: string | null;
          p_telefon?: string | null;
          p_website?: string | null;
          p_instagram_url?: string | null;
          p_facebook_url?: string | null;
          p_crm_system?: CrmSystem | null;
          p_anfragen_pro_woche?: number | null;
          p_pipeline_status?: PipelineStatus;
          p_person_name?: string | null;
          p_person_email?: string | null;
          p_person_telefon?: string | null;
          p_person_linkedin_url?: string | null;
        };
        Returns: string;
      };
      set_pipeline_status: {
        Args: {
          p_company_id: string;
          p_pipeline_status: PipelineStatus;
          p_kanal?: Extract<TouchKanal, "call" | "dm" | "status_change">;
          p_naechster_touch?: string | null;
        };
        Returns: Json;
      };
      set_company_list_membership: {
        Args: {
          p_company_id: string;
          p_list_ids: string[];
        };
        Returns: undefined;
      };
      upsert_person_atomic: {
        Args: {
          p_person_id: string | null;
          p_company_id: string;
          p_name: string;
          p_rolle?: string | null;
          p_email?: string | null;
          p_telefon?: string | null;
          p_linkedin_url?: string | null;
          p_ist_entscheider?: boolean;
        };
        Returns: string;
      };
      gdpr_anonymize: {
        Args: { p_company_id: string };
        Returns: undefined;
      };
      akquise_kpis: {
        Args: { p_from: string; p_to: string };
        Returns: Json;
      };
      analytics_dashboard: {
        Args: { p_from: string; p_to: string };
        Returns: Json;
      };
      pipeline_status_counts: {
        Args: Record<string, never>;
        Returns: Json;
      };
      create_task: {
        Args: {
          p_company_id: string;
          p_titel: string;
          p_due_on: string;
          p_person_id?: string | null;
          p_notiz?: string | null;
          p_art?: string;
          p_email_preset?: string | null;
          p_set_naechster?: boolean | null;
        };
        Returns: string;
      };
      complete_task: {
        Args: { p_task_id: string };
        Returns: undefined;
      };
      run_due_sequence_steps: {
        Args: Record<string, never>;
        Returns: number;
      };
      reorder_custom_field_defs: {
        Args: { p_ordered_ids: string[] };
        Returns: undefined;
      };
    };
    Enums: {
      pipeline_status: PipelineStatus;
      touch_kanal: TouchKanal;
    };
    CompositeTypes: Record<string, never>;
  };
};
