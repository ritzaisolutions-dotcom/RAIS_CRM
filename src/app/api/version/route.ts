/**
 * Kennung des laufenden Deployments. `UpdateWatcher` fragt sie regelmäßig ab
 * und meldet eine neue Version, sobald sie sich ändert.
 *
 * Bewusst ohne Anmeldung erreichbar (siehe `PUBLIC_PATHS` in der Middleware):
 * die ID steht ohnehin als `?dpl=` an jedem Asset, und auch ein alter Tab auf
 * /login soll merken, dass er veraltet ist.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const id =
    process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";
  return Response.json(
    { id },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
