
import { cn } from "@/lib/utils";

type MapEmbedProps = {
  title: string;
  className?: string;
};

export function MapEmbed({ title, className }: MapEmbedProps) {
  return (
    <div className={cn("section-shell overflow-hidden", className)}>
      <iframe
        title={title}
        src="https://www.google.com/maps?q=Storgatan+12,+411+38+G%C3%B6teborg&output=embed"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="h-[340px] w-full"
      />
    </div>
  );
}

export default MapEmbed;
