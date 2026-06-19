// Exporterar cn-hjälpfunktionen för att slå ihop clsx-klasser med tailwind-merge.
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
