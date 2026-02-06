import { Suspense } from "react";
import { HomePage, Footer } from "@/components/layout";

export default function Home() {
  return (
    <>
      <Suspense>
        <HomePage />
      </Suspense>
      <Footer />
    </>
  );
}
