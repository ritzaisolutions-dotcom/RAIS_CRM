import type {
  Abbruchgrund,
  CallListeRow,
  Company,
  CrmSystem,
  MitarbeiterKlasse,
  Opportunity,
  OppStage,
  OppVariante,
  Person,
  PipelineStatus,
  TouchErgebnis,
  TouchKanal,
  Touchpoint,
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
          telefon?: string | null;
          mitarbeiterzahl?: MitarbeiterKlasse | null;
          crm_system?: CrmSystem | null;
          anfragen_pro_woche?: number | null;
          inserate_aktiv?: number | null;
          recherche?: string | null;
          pipeline_status?: PipelineStatus;
        },
        {
          // `relationship` fehlt bewusst: das UPDATE-Recht auf diese Spalte ist
          // entzogen, sie wird nur noch von `set_pipeline_status` gesetzt.
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
        },
        {
          variante?: OppVariante;
          setup_preis?: number | null;
          retainer_monatlich?: number | null;
          stage?: OppStage;
          close_grund?: string | null;
          closed_at?: string | null;
        }
      >;
    };
    Views: {
      v_call_liste: {
        Row: CallListeRow;
        Relationships: [];
      };
      v_kunden_liste: {
        Row: CallListeRow;
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
    };
    Enums: {
      pipeline_status: PipelineStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
