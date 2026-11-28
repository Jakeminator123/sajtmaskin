import { notFound } from "next/navigation";
import { hostedAlina } from "@/lib/avatar/alina-hosted";

export default function AlinaAdminPage() {
  if (process.env.NODE_ENV !== "development" && !hostedAlina()) notFound();
  return (
    <iframe
      title="Regissörsvy för Alina"
      src="/video/aida/presenter-v2/SCEN/index.html?edit=1"
      allow="autoplay"
      className="h-[84dvh] w-full rounded-xl border border-white/10"
    />
  );
}
