export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  console.error("[app error]", error, {
    route: window.location.pathname,
    ...context,
  });
}
