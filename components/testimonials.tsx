'use client'

import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Star } from 'lucide-react'

const testimonials = [
  {
    name: 'Anna Svensson',
    role: 'Löpare',
    content: 'Fantastisk service och kvalitet! Fick mina nya löparskor på bara 2 dagar. Training Ground har blivit min go-to butik för all träningsutrustning.',
    rating: 5,
    avatar: '/placeholder.svg?height=40&width=40',
  },
  {
    name: 'Erik Johansson',
    role: 'Crossfit-utövare',
    content: 'Bred urvalsortiment av premiumvarumärken till konkurrenskraftiga priser. Kundtjänsten hjälpte mig välja rätt storlek - perfekt passform!',
    rating: 5,
    avatar: '/placeholder.svg?height=40&width=40',
  },
  {
    name: 'Maria Lindberg',
    role: 'Yoga-instruktör',
    content: 'Älskar att de har såväl högintensiva träningskläder som lugnare yoga-produkter. Allt av högsta kvalitet. Rekommenderas varmt!',
    rating: 5,
    avatar: '/placeholder.svg?height=40&width=40',
  },
]

export function Testimonials() {
  return (
    <section className="py-16 md:py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-balance">
            Vad Våra Kunder Säger
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto text-pretty leading-relaxed">
            Över 5,000 nöjda kunder över hela Sverige
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <Card
              key={index}
              className="p-6 bg-card/80 backdrop-blur-sm border-border hover:border-accent/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
            >
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4 fill-accent text-accent"
                  />
                ))}
              </div>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                "{testimonial.content}"
              </p>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={testimonial.avatar || "/placeholder.svg"} alt={testimonial.name} />
                  <AvatarFallback>{testimonial.name[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-sm">{testimonial.name}</p>
                  <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
