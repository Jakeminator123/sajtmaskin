import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <span className="inline-flex animate-spin">
      <Loader2Icon
        role="status"
        aria-label="Loading"
        className={cn("size-4", className)}
        {...props}
      />
    </span>
  )
}

export { Spinner }
