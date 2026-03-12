# app/page.tsx

Reason: Useful structural reference

```text
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import Link from "next/link"
import { Star, Check, Coins, UserCheck, Database } from "lucide-react"
import Stripe from 'stripe'

// Types
interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  features: string[];
  price: Stripe.Price;
}

// This makes the page dynamic instead of static
export const revalidate = 3600 // Revalidate every hour

async function getStripeProducts(): Promise<StripeProduct[]> {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2024-06-20'
  });

  const products = await stripe.products.list({
    active: true,
    expand: ['data.default_price']
  });

  return products.data.map(product => ({
    id: product.id,
    name: product.name,
    description: product.description,
    features: product.metadata?.features ? JSON.parse(product.metadata.features) : [],
    price: product.default_price as Stripe.Price
  }));
}

export default async function LandingPage() {
  const products = await getStripeProducts();

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <header className="px-4 lg:px-6 h-16 flex items-center  bg-white border-b fixed border-b-slate-200 w-full">
        <Link className="flex items-center justify-center" href="#">
          <Image src="/logo.png" alt="logo" width={50} height={50} />
          <span className="sr-only">Acme Inc</span>
        </Link>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          <a className="text-sm font-medium hover:underline underline-offset-4" href="#features">
            Features
          </a>
          <a className="text-sm font-medium hover:underline underline-offset-4" href="#testimonials">
            Testimonials
          </a>
          <a className="text-sm font-medium hover:underline underline-offset-4" href="#pricing">
            Pricing
          </a>
        </nav>
        <Button className="mx-2 md:mx-4 lg:mx-6 xl:mx-10" >
          <Link className="text-sm font-medium hover:underline underline-offset-4" href="/login">
            Get Started
          </Link>
        </Button>
      </header>
      <main className="flex-1">
        <se

// ... truncated
```
