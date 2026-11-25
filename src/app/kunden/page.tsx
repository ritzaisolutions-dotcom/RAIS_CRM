import { redirect } from "next/navigation";

/** Alte Route — führt in die neue Leads-Ansicht (Kunden). */
export default function KundenRedirect() {
  redirect("/leads?view=kunden");
}
