const DEFAULT_AUTHENTICATED_PATH = "/liste";

export function safeInternalRedirect(
  candidate: string | null | undefined,
): string {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return DEFAULT_AUTHENTICATED_PATH;
  }

  try {
    const parsed = new URL(candidate, "https://crm.internal");
    if (
      parsed.origin !== "https://crm.internal" ||
      parsed.pathname === "/login" ||
      parsed.pathname.startsWith("/login/")
    ) {
      return DEFAULT_AUTHENTICATED_PATH;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_AUTHENTICATED_PATH;
  }
}
