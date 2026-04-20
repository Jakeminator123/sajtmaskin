import { ReactNode } from "react";
import { AI } from "@/components/lib/ai";

export function AIProvider({ children }: { children: ReactNode }) {
  return <AI>{children}</AI>;
}
