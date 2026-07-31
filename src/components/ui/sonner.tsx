"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          // A1 (2026-07-31): appens --popover/--border-tokens är råa
          // "H S% L%"-tripplar avsedda att användas inuti hsl(...) (se
          // tailwind.config.cjs → colors.popover/border). sonner's egen CSS
          // konsumerar --normal-bg/-text/-border direkt som färgvärden
          // (`background: var(--normal-bg)`), så utan hsl()-wrappern blev
          // värdet en ogiltig CSS-färg som webbläsaren ignorerade — toasten
          // fick transparent bakgrund men behöll sin (ljusa) textfärg, dvs
          // "osynlig ruta med vit text". --radius är redan ett giltigt
          // längdvärde och behöver ingen wrapper.
          "--normal-bg": "hsl(var(--popover))",
          "--normal-text": "hsl(var(--popover-foreground))",
          "--normal-border": "hsl(var(--border))",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
