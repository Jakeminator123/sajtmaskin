import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a section's server component resolves — keeps the shell steady. */
export default function AdminLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
