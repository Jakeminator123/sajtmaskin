import { notFound, redirect } from "next/navigation";

export default function AlinaBackofficePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  redirect("/admin/alina");
}
