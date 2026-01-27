import { getPostsByAuthor } from '@/lib/db';
import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { BlogCard } from '@/components/blog-card';
import { AdminPanel } from '@/components/admin-panel';
import { Sparkles, Palette, Candy, Users, Moon } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Zelda blogg',
  description: 'Zeldas blogg om pyssel, choklad, godis och roliga äventyr!',
};

export default async function ZeldaPage() {
  const posts = await getPostsByAuthor('zelda');

  const interests = [
    {
      icon: Palette,
      title: 'Pyssel',
      description: 'Jag älskar att klippa, klistra och måla! Kreativitet är det roligaste som finns.',
      color: 'from-zelda-pink to-zelda-pink-dark',
    },
    {
      icon: Candy,
      title: 'Choklad & Godis',
      description: 'Mitt favoritgodis är nappar och geléhallon. Och choklad är alltid gott!',
      color: 'from-candy-orange to-candy-orange-dark',
    },
    {
      icon: Users,
      title: 'Leka med Agnes',
      description: 'Agnes är min bästa kompis! Vi leker jättemycket tillsammans.',
      color: 'from-blanka-teal to-blanka-teal-dark',
    },
    {
      icon: Moon,
      title: 'Sova i mammas säng',
      description: 'Det är så mysigt att somna i mammas säng på kvällarna!',
      color: 'from-candy-purple to-candy-purple-dark',
    },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b-4 border-zelda-pink bg-gradient-zelda py-24 sm:py-36">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0icGF0dGVybiIgeD0iMCIgeT0iMCIgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjxjaXJjbGUgY3g9IjI1IiBjeT0iMjUiIHI9IjMiIGZpbGw9IiNmZmYiIG9wYWNpdHk9IjAuMyIvPjxwb2x5Z29uIHBvaW50cz0iNzUsMTUgODAsMjUgODUsMTUiIGZpbGw9IiNmZmYiIG9wYWNpdHk9IjAuMyIvPjxyZWN0IHg9IjYwIiB5PSI2MCIgd2lkdGg9IjgiIGhlaWdodD0iOCIgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iMC4yNSIgcng9IjIiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjcGF0dGVybikiLz48L3N2Zz4=')] opacity-50" />
          
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center text-center">
              <div className="mb-8 flex h-32 w-32 items-center justify-center rounded-3xl bg-white shadow-2xl shadow-zelda-pink/40 transition-transform hover:rotate-3 hover:scale-105">
                <Sparkles className="h-16 w-16 text-zelda-pink" />
              </div>
              
              <h1 className="text-balance font-bold text-6xl text-white drop-shadow-lg sm:text-7xl md:text-8xl">
                Zeldas blogg
              </h1>
              <p className="mx-auto mt-8 max-w-2xl text-pretty text-xl text-white drop-shadow-md sm:text-2xl font-medium leading-relaxed">
                Hej! Jag heter Zelda och här skriver jag om allt roligt jag gör. Pyssel, godis, vänner och mycket mer!
              </p>
              
              {/* Decorative images */}
              <div className="mt-12 flex flex-wrap items-center justify-center gap-6">
                <div className="h-32 w-32 overflow-hidden rounded-2xl bg-white p-1 shadow-lg transition-all hover:scale-110 hover:rotate-3 hover:shadow-2xl animate-float" style={{ animationDelay: '0s' }}>
                  <img src="/images/strand.jpg" alt="Badar" className="h-full w-full object-cover rounded-xl" />
                </div>
                <div className="h-32 w-32 overflow-hidden rounded-2xl bg-white p-1 shadow-lg transition-all hover:scale-110 hover:-rotate-3 hover:shadow-2xl animate-float" style={{ animationDelay: '0.5s' }}>
                  <img src="/images/klattring.jpg" alt="Klättrar" className="h-full w-full object-cover rounded-xl" />
                </div>
                <div className="h-32 w-32 overflow-hidden rounded-2xl bg-white p-1 shadow-lg transition-all hover:scale-110 hover:rotate-3 hover:shadow-2xl animate-float" style={{ animationDelay: '1s' }}>
                  <img src="/images/godis.jpg" alt="Godis" className="h-full w-full object-cover rounded-xl" />
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
                Mina intressen
              </h2>
              <p className="mt-4 text-pretty text-lg text-muted-foreground">
                Det här är några av mina favoritgrejer!
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {interests.map((interest, index) => {
                const Icon = interest.icon;
                return (
                  <div
                    key={interest.title}
                    className="group relative overflow-hidden rounded-3xl border-2 border-white/50 bg-white p-8 shadow-xl transition-all hover:scale-105 hover:-translate-y-2 hover:shadow-2xl"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${interest.color} opacity-10 blur-2xl transition-all group-hover:opacity-20`} />
                    <div className={`relative mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${interest.color} shadow-lg transition-transform group-hover:rotate-6 group-hover:scale-110`}>
                      <Icon className="h-10 w-10 text-white" />
                    </div>
                    <h3 className="mb-3 font-bold text-xl text-foreground">{interest.title}</h3>
                    <p className="text-pretty text-muted-foreground leading-relaxed">
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
                <Sparkles className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Inga inlägg att visa ännu. Kom tillbaka snart!
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
      <AdminPanel author="zelda" />
    </div>
  );
}
