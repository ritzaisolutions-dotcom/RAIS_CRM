import { redirect } from "next/navigation";

/** Alte Route — führt in die neue Leads-Ansicht (Wiedervorlagen). */
export default function TodosRedirect() {
  redirect("/wiedervorlagen");
}
