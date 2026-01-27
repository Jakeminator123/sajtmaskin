import { getPostsByAuthor } from '@/lib/db';
import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { BlogCard } from '@/components/blog-card';
import { AdminPanel } from '@/components/admin-panel';
import { Heart, Trophy, Smile, Users2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Blanka blogg',
  description: 'Blankas blogg om fotboll, tacksamhet och elevrådsliv!',
};

export default async function BlankaPage() {
  const posts = await getPostsByAuthor('blanka');

  const interests = [
    {
      icon: Trophy,
      title: 'Fotboll',
      description: 'Fotboll är det bästa som finns! Jag älskar att spela och träna med mitt lag.',
      color: 'from-blanka-teal to-blanka-teal-dark',
    },
    {
      icon: Smile,
      title: 'Tacksamhet',
      description: 'Jag tycker det är viktigt att vara tacksam för allt fint man har i livet.',
      color: 'from-candy-yellow to-candy-yellow-dark',
    },
    {
      icon: Users2,
      title: 'Elevrådsrepresentant',
      description: 'Jag är elevrådsrepresentant och vill göra skolan bättre för alla!',
      color: 'from-candy-purple to-candy-purple-dark',
    },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b-4 border-blanka-teal bg-gradient-blanka py-24 sm:py-36">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0icGF0dGVybjIiIHg9IjAiIHk9IjAiIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSI1IiBmaWxsPSIjZmZmIiBvcGFjaXR5PSIwLjMiLz48Y2lyY2xlIGN4PSI3MCIgY3k9IjcwIiByPSI0IiBmaWxsPSIjZmZmIiBvcGFjaXR5PSIwLjI1Ii8+PHBhdGggZD0iTTYwIDEwIEw2NSAyMCBMNzAgMTAgWiIgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iMC4zIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI3BhdHRlcm4yKSIvPjwvc3ZnPg==')] opacity-50" />
          
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center text-center">
              <div className="mb-8 flex h-32 w-32 items-center justify-center rounded-3xl bg-white shadow-2xl shadow-blanka-teal/40 transition-transform hover:rotate-3 hover:scale-105">
                <Heart className="h-16 w-16 text-blanka-teal" />
              </div>
              
              <h1 className="text-balance font-bold text-6xl text-white drop-shadow-lg sm:text-7xl md:text-8xl">
                Blankas blogg
              </h1>
              <p className="mx-auto mt-8 max-w-2xl text-pretty text-xl text-white drop-shadow-md sm:text-2xl font-medium leading-relaxed">
                Hej! Jag heter Blanka och här delar jag med mig av mina tankar om fotboll, skolan och allt jag är tacksam för!
              </p>
              
              {/* Decorative images */}
              <div className="mt-12 flex flex-wrap items-center justify-center gap-6">
                <div className="h-32 w-32 overflow-hidden rounded-2xl bg-white p-1 shadow-lg transition-all hover:scale-110 hover:rotate-3 hover:shadow-2xl animate-float" style={{ animationDelay: '0.2s' }}>
                  <img src="/images/fotboll.jpg" alt="Fotboll" className="h-full w-full object-cover rounded-xl" />
                </div>
                <div className="h-32 w-32 overflow-hidden rounded-2xl bg-white p-1 shadow-lg transition-all hover:scale-110 hover:-rotate-3 hover:shadow-2xl animate-float" style={{ animationDelay: '0.7s' }}>
                  <img src="/images/strand.jpg" alt="Badar" className="h-full w-full object-cover rounded-xl" />
                </div>
                <div className="h-32 w-32 overflow-hidden rounded-2xl bg-white p-1 shadow-lg transition-all hover:scale-110 hover:rotate-3 hover:shadow-2xl animate-float" style={{ animationDelay: '1.2s' }}>
                  <img src="/images/klattring.jpg" alt="Klättrar" className="h-full w-full object-cover rounded-xl" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interests Section */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="text-balance font-bold text-3xl text-foreground sm:text-4xl">
                Vad jag älskar
              </h2>
              <p className="mt-4 text-pretty text-lg text-muted-foreground">
                Det här är några av mina favoritgrejer!
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {interests.map((interest, index) => {
                const Icon = interest.icon;
                return (
                  <div
                    key={interest.title}
                    className="group relative overflow-hidden rounded-3xl border-2 border-white/50 bg-white p-10 shadow-xl transition-all hover:scale-105 hover:-translate-y-2 hover:shadow-2xl"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${interest.color} opacity-10 blur-2xl transition-all group-hover:opacity-20`} />
                    <div className={`relative mb-6 inline-flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br ${interest.color} shadow-lg transition-transform group-hover:rotate-6 group-hover:scale-110`}>
                      <Icon className="h-12 w-12 text-white" />
                    </div>
                    <h3 className="mb-4 font-bold text-2xl text-foreground">{interest.title}</h3>
                    <p className="text-pretty text-muted-foreground text-lg leading-relaxed">
                      {interest.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Blog Posts Section */}
        <section className="bg-muted/30 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="text-balance font-bold text-3xl text-foreground sm:text-4xl">
                Mina inlägg
              </h2>
              <p className="mt-4 text-pretty text-lg text-muted-foreground">
                Kolla in vad jag har skrivit!
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </div>

            {posts.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-border bg-card p-12 text-center">
                <Heart className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Inga inlägg att visa ännu. Kom tillbaka snart!
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
      <AdminPanel author="blanka" />
    </div>
  );
}
