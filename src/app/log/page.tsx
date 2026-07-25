import { redirect } from "next/navigation";

/**
 * Legacy alias. The log viewer moved into the admin console
 * (`/admin/loggar`), where it is admin-gated like the data it shows —
 * `/log` and `/logg` rendered the same component on two public URLs.
 */
export default function LegacyLogPage() {
  redirect("/admin/loggar");
}
