import { redirect } from "next/navigation";

/** Alte Route — führt in die neue Leads-Ansicht (Alle aktiven). */
export default function ListeRedirect() {
  redirect("/leads");
}
