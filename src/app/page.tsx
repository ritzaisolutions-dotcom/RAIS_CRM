import { redirect } from "next/navigation";

/** Alte Route — führt in die neue Leads-Ansicht (Start). */
export default function HomePage() {
  redirect("/leads");
}
