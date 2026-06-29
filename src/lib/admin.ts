// Sole admin account allowed to see the /admin panel and trigger AI jobs.
// Override via NEXT_PUBLIC_ADMIN_EMAILS (CSV) if it ever needs to change.
// NEXT_PUBLIC_ so the same check works in the client page and the server route.
export const ADMIN_EMAILS = (
  process.env.NEXT_PUBLIC_ADMIN_EMAILS || "roshankshiggaonkar@gmail.com"
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
