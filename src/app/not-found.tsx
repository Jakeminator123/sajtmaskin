import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-2 text-6xl font-bold text-white">404</h1>
        <h2 className="mb-4 text-xl font-semibold text-gray-300">Sidan hittades inte</h2>
        <p className="mb-8 text-gray-500">
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
