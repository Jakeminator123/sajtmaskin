
import Link from "next/link";
import { ExternalLink, MapPin } from "lucide-react"


import { businessInfo } from "@/lib/site";
import { Button } from "@/components/ui/button"

type MapEmbedProps = {
  title: string;
};

export function MapEmbed({ title }: MapEmbedProps) {
  return (
    <div className="paper-panel-strong overflow-hidden p-3">
      <div className="overflow-hidden rounded-[1.5rem] border border-border/60 bg-muted">
        <iframe
          src={businessInfo.mapEmbed}
          title={title}
          className="h-[320px] w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary">
            <MapPin className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium">{businessInfo.address}</p>
            <p className="text-sm text-muted-foreground">
              {businessInfo.postalCode} {businessInfo.city}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="rounded-full">
          <Link href={businessInfo.googleMaps} target="_blank" rel="noreferrer">
            Öppna i Google Maps
            <ExternalLink className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default MapEmbed;
