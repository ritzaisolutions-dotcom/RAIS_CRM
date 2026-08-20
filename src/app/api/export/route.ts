import { NextResponse, type NextRequest } from "next/server";
import { fetchListeForExport } from "@/lib/sales/queries";
import { businessToday } from "@/lib/sales/dates";
import { buildCsv } from "@/lib/sales/csv";
import type {
  CallListeRow,
  ListeDueFilter,
  PipelineStatus,
} from "@/lib/sales/types";
import {
  PIPELINE_STATUS_LABELS,
  PIPELINE_STATUS_OPTIONS,
} from "@/lib/sales/types";

export const dynamic = "force-dynamic";

/**
 * CSV-Export der Call- bzw. Kundenliste.
 *
 * Route Handler statt Server Action mit Blob: der Browser bekommt direkt eine
 * Datei mit `Content-Disposition`, ohne dass die Zeilen erst durch den
 * Client-Bundle wandern. Der Zugriffsschutz läuft wie bei allen anderen Routen
 * über die Middleware; zusätzlich greift RLS.
 */

const COLUMNS: { header: string; get: (r: CallListeRow) => string | number | null }[] =
  [
    { header: "Firma", get: (r) => r.firma },
    { header: "Entscheider", get: (r) => r.entscheider },
    {
      header: "Status",
      get: (r) => (r.status ? PIPELINE_STATUS_LABELS[r.status] : null),
    },
    { header: "Nächster Touch", get: (r) => r.naechster_touch },
    { header: "Tage seit Touch", get: (r) => r.tage_seit_touch },
    { header: "Telefon", get: (r) => r.tel },
    { header: "E-Mail", get: (r) => r.email },
    { header: "Website", get: (r) => r.website },
    { header: "LinkedIn", get: (r) => r.linkedin_url },
    { header: "Instagram", get: (r) => r.instagram_url },
    { header: "Facebook", get: (r) => r.facebook_url },
    { header: "CRM", get: (r) => r.crm },
    { header: "Anfragen/Woche", get: (r) => r["anfragen/woche"] },
    { header: "Inserate aktiv", get: (r) => r.inserate_aktiv },
  ];

function parseStatus(value: string | null): PipelineStatus | "" {
  return PIPELINE_STATUS_OPTIONS.includes(value as PipelineStatus)
    ? (value as PipelineStatus)
    : "";
}

function parseDue(value: string | null): ListeDueFilter {
  return value === "today" || value === "overdue" ? value : "";
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const kunden = params.get("view") === "kunden";
  const view = kunden ? "v_kunden_liste" : "v_call_liste";

  const { rows, truncated } = await fetchListeForExport(view, {
    status: kunden ? "" : parseStatus(params.get("status")),
    due: kunden ? "" : parseDue(params.get("due")),
    q: params.get("q") ?? "",
  });

  const csv = buildCsv(rows, COLUMNS);
  const filename = `${kunden ? "kunden" : "prospects"}-${businessToday()}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      ...(truncated ? { "X-Export-Truncated": "true" } : {}),
    },
  });
}
