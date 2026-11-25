import type { Metadata } from "next";
import Image from "next/image";
import { InviteBooking } from "@/components/booking/InviteBooking";
import { loadInvite } from "@/lib/booking/invites";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Termin wählen",
  robots: { index: false, follow: false },
};

export default async function TerminPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { token } = await params;
  const { s } = await searchParams;
  const view = await loadInvite(token);
  const preselect = Number.isInteger(Number(s)) ? Number(s) : null;

  return (
    // Immer hell, unabhängig vom CRM-Theme: das ist eine Seite für Kunden.
    <div className="min-h-dvh bg-[#F5F2EC] px-4 py-10 text-[#2F2A24] [color-scheme:light]">
      <div className="mx-auto max-w-md">
        <Image
          src="/rais_logo_with_text.svg"
          alt="RAIS — Ritz AI Solutions"
          width={160}
          height={42}
          className="mb-6 h-9 w-auto"
          priority
        />
        <div className="rounded-xl border border-[#D9D1C7] bg-[#FBF8F3] p-6 shadow-sm">
          {view.state === "not_found" ? (
            <>
              <h1 className="text-lg font-semibold">Link nicht gefunden</h1>
              <p className="mt-2 text-sm text-[#7B746B]">
                Dieser Terminlink ist ungültig. Antworten Sie gern einfach auf die E-Mail, dann
                finden wir einen Termin.
              </p>
            </>
          ) : view.state === "expired" ? (
            <>
              <h1 className="text-lg font-semibold">Diese Termine sind vorbei</h1>
              <p className="mt-2 text-sm text-[#7B746B]">
                Die vorgeschlagenen Termine liegen in der Vergangenheit. Antworten Sie kurz auf die
                E-Mail, dann schicke ich neue Vorschläge.
              </p>
            </>
          ) : (
            <InviteBooking token={token} view={view} preselect={preselect} />
          )}
        </div>
        <p className="mt-4 text-center text-xs text-[#7B746B]">
          RAIS · Ritz AI Solutions
        </p>
      </div>
    </div>
  );
}
