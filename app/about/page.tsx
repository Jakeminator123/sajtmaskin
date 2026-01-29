import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Award, Heart, Zap, Shield, Users, Target, Quote, MapPin, Mail, Phone, Clock, ArrowRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

export default function AboutPage() {
  const values = [
    {
      icon: Award,
      title: 'Premium Kvalitet',
      description: 'Vi erbjuder endast produkter från välrenommerade varumärken som håller högsta standard.'
    },
    {
      icon: Heart,
      title: 'Passion för Träning',
      description: 'Grundat av träningsentusiaster, för träningsentusiaster. Vi förstår dina behov.'
    },
    {
      icon: Zap,
      title: 'Snabb Leverans',
      description: 'Express leverans inom 1-3 dagar. Vi vet att du vill komma igång direkt.'
    },
    {
      icon: Shield,
      title: 'Trygg Handel',
      description: '30 dagars öppet köp och enkla returer. Din trygghet är vår prioritet.'
    },
    {
      icon: Users,
      title: 'Kundservice',
      description: 'Vårt erfarna team finns här för att hjälpa dig välja rätt utrustning.'
    },
    {
      icon: Target,
      title: 'Målmedveten',
      description: 'Vi hjälper dig nå dina träningsmål med rätt utrustning och inspiration.'
    }
  ]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-24 md:py-32 border-b border-border/40">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground mb-6">
                <span className="w-8 h-px bg-accent" />
                Om Oss
              </div>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
                Passion för <span className="text-accent">Träning</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl">
                Training Ground AB grundades med en vision: att skapa 
                Sveriges bästa destination för premium träningsutrustning. Inte den största — den bästa.
              </p>
            </div>
          </div>
        </section>

        {/* Founder Section */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center max-w-6xl mx-auto">
              {/* Image */}
              <div className="relative order-2 lg:order-1">
                <div className="relative aspect-[3/4] rounded-2xl overflow-hidden">
                  <Image
                    src="/founder.jpg"
                    alt="Training Ground AB grundare"
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
                </div>
                
                {/* Floating card */}
                <div className="absolute -bottom-6 -right-6 md:bottom-8 md:-right-8 bg-card border border-border/50 rounded-xl p-4 md:p-6 shadow-xl max-w-[200px]">
                  <div className="text-3xl md:text-4xl font-bold text-accent">2024</div>
                  <div className="text-sm text-muted-foreground mt-1">Grundat i Solna</div>
                </div>
              </div>

              {/* Content */}
              <div className="space-y-6 order-1 lg:order-2">
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                  Vår <span className="text-accent">Historia</span>
                </h2>
                
                <div className="relative pl-6 border-l-2 border-accent/30">
                  <Quote className="absolute -left-3 top-0 w-6 h-6 text-accent bg-background" />
                  <blockquote className="text-lg md:text-xl text-muted-foreground italic leading-relaxed">
                    "Vi var trötta på att vänta veckor på leveranser, osäkra på om produkterna var äkta, 
                    och frustrerade över dålig kundservice. Så vi byggde den butik vi alltid önskade fanns."
                  </blockquote>
                </div>

                <div className="space-y-4 text-muted-foreground leading-relaxed">
                  <p>
                    Som aktiva idrottare och träningsentusiaster har vi alltid 
                    förstått vikten av rätt utrustning. Men det var de upprepade besvikelserna med 
                    andra svenska webbutiker som blev katalysatorn för Training Ground AB.
                  </p>
                  <p>
                    Företaget grundades med en enkel men kraftfull mission: att bevisa att det går 
                    att kombinera premium produkter, snabb leverans och exceptionell service — utan 
                    att kompromissa på något av dem.
                  </p>
                </div>

                <Link href="/#shop">
                  <Button className="bg-accent hover:bg-accent/90 text-accent-foreground mt-4">
                    Upptäck Vårt Sortiment
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 border-y border-border/40 bg-secondary/30">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto text-center">
              <div>
                <div className="text-4xl md:text-5xl font-bold text-accent">500+</div>
                <div className="text-sm text-muted-foreground mt-2">Produkter</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-bold">15+</div>
                <div className="text-sm text-muted-foreground mt-2">Varumärken</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-bold">1-3</div>
                <div className="text-sm text-muted-foreground mt-2">Dagars Leverans</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-bold text-accent">100%</div>
                <div className="text-sm text-muted-foreground mt-2">Äkta Produkter</div>
              </div>
            </div>
          </div>
        </section>

        {/* Values Section */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mb-16">
              <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
                <span className="w-8 h-px bg-accent" />
                Våra Värderingar
              </div>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                Det vi står för
              </h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
              {values.map((value) => {
                const Icon = value.icon
                return (
                  <Card key={value.title} className="p-6 bg-card/50 border-border/50 hover:border-accent/30 transition-colors">
                    <div className="p-2 rounded-lg bg-accent/10 w-fit mb-4">
                      <Icon className="h-5 w-5 text-accent" />
                    </div>
                    <h3 className="font-semibold mb-2">{value.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {value.description}
                    </p>
                  </Card>
                )
              })}
            </div>
          </div>
        </section>

        {/* Contact Section */}
        <section id="contact" className="py-20 md:py-28 bg-secondary/30 border-t border-border/40">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
                  <span className="w-8 h-px bg-accent" />
                  Kontakt
                  <span className="w-8 h-px bg-accent" />
                </div>
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                  Vi finns här för dig
                </h2>
              </div>
              
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
                <Card className="p-6 text-center bg-card/50 border-border/50 hover:border-accent/30 transition-colors">
                  <div className="inline-flex p-3 rounded-lg bg-accent/10 text-accent mb-4">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-sm mb-1">Adress</h3>
                  <p className="text-sm text-muted-foreground">
                    Ballonggatan 7<br />169 71 Solna
                  </p>
                </Card>
                
                <Card className="p-6 text-center bg-card/50 border-border/50 hover:border-accent/30 transition-colors">
                  <div className="inline-flex p-3 rounded-lg bg-accent/10 text-accent mb-4">
                    <Mail className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-sm mb-1">E-post</h3>
                  <p className="text-sm text-muted-foreground">
                    info@trainingground.se
                  </p>
                </Card>
                
                <Card className="p-6 text-center bg-card/50 border-border/50 hover:border-accent/30 transition-colors">
                  <div className="inline-flex p-3 rounded-lg bg-accent/10 text-accent mb-4">
                    <Phone className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-sm mb-1">Telefon</h3>
                  <p className="text-sm text-muted-foreground">
                    08-123 456 78
                  </p>
                </Card>
                
                <Card className="p-6 text-center bg-card/50 border-border/50 hover:border-accent/30 transition-colors">
                  <div className="inline-flex p-3 rounded-lg bg-accent/10 text-accent mb-4">
                    <Clock className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-sm mb-1">Öppettider</h3>
                  <p className="text-sm text-muted-foreground">
                    Mån-Fre 09:00-17:00
                  </p>
                </Card>
              </div>

              <Card className="p-8 bg-card border-border/50">
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <Award className="w-5 h-5 text-accent" />
                      Företagsinformation
                    </h3>
                    <dl className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Företagsnamn</dt>
                        <dd className="font-medium">Training Ground AB</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Org.nummer</dt>
                        <dd className="font-medium">559548-5441</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Grundare & VD</dt>
                        <dd className="font-medium">M. Dejene</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Grundat</dt>
                        <dd className="font-medium">2024</dd>
                      </div>
                    </dl>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-accent" />
                      Trygg Handel
                    </h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                        Säkra betalningar via Klarna & Swish
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                        30 dagars öppet köp
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                        Fri frakt över 499 kr
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                        100% äkta produkter
                      </li>
                    </ul>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
