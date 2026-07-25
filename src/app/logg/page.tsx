import { redirect } from "next/navigation";

/** Legacy alias — see `src/app/log/page.tsx`. */
export default function LegacyLoggPage() {
  redirect("/admin/loggar");
}
