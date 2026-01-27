import { Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t-4 border-primary/20 bg-gradient-to-br from-zelda-pink-bg to-blanka-teal-bg">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center gap-6 text-center">
          <div className="flex items-center gap-3 text-foreground font-bold text-lg">
            <span>Gjord med</span>
            <Heart className="h-6 w-6 animate-pulse fill-primary text-primary" />
            <span>av Zelda & Blanka</span>
          </div>
          <p className="text-muted-foreground font-medium">
            © 2026 Zelda & Blanka Bloggar. Alla rättigheter förbehållna.
          </p>
        </div>
      </div>
    </footer>
  );
}
