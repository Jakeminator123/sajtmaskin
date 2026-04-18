import Link from "next/link";
import { Mascot } from "@/components/mascot/Mascot";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto mb-4 flex justify-center">
          <Mascot slot="lost-in-space" size={420} decorative className="h-auto w-full max-w-[420px]" />
        </div>
        <h1 className="mb-2 text-6xl font-bold text-foreground">404</h1>
        <h2 className="mb-4 text-xl font-semibold text-foreground">Sidan hittades inte</h2>
        <p className="mb-8 text-muted-foreground">
          Sidan du letar efter finns inte eller har flyttats.
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-brand-blue px-6 py-3 font-medium text-white transition-colors hover:bg-brand-blue/90"
        >
          Till startsidan
        </Link>
      </div>
    </div>
  );
}
