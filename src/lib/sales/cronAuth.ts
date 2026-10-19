import { NextRequest } from "next/server";

export function assertCronAuth(req: NextRequest): Response | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET nicht konfiguriert" },
      { status: 503 },
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const query = req.nextUrl.searchParams.get("secret") ?? "";
  if (bearer !== secret && query !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
