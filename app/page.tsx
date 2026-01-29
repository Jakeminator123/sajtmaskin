import { Header } from '@/components/header'
import { HeroSection } from '@/components/hero-section'
import { TrustSection } from '@/components/trust-section'
import { CategoryGrid } from '@/components/category-grid'
import { ProductGrid } from '@/components/product-grid'
import { FounderStory } from '@/components/founder-story'
import { BrandShowcase } from '@/components/brand-showcase'
import { Footer } from '@/components/footer'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <TrustSection />
        <CategoryGrid />
        <ProductGrid />
        <FounderStory />
        <BrandShowcase />
      </main>
      <Footer />
    </div>
  )
}
