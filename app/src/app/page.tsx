import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold">Sajtmaskin</h1>
        <p className="text-muted-foreground">
          Next.js + Tailwind CSS + shadcn/ui
        </p>
        <Button>Test Button</Button>
      </div>
    </main>
  );
}
