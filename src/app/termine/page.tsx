import { redirect } from "next/navigation";

/** Alte Route — führt in die neue Leads-Ansicht (Termin gebucht). */
export default function TermineRedirect() {
  redirect("/leads?view=termin");
}
