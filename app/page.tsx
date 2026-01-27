import { getRecentPosts } from '@/lib/db';
import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { BlogCard } from '@/components/blog-card';
import { Sparkles, Heart } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const posts = await getRecentPosts(6);

  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section 
          className="relative overflow-hidden border-b-4 border-pink-200 py-20 sm:py-32"
          style={{ background: 'linear-gradient(to bottom right, #fdf2f8, #f0fdfa, #fffbeb)' }}
        >
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxjaXJjbGUgZmlsbD0iI2ZmZiIgZmlsbC1vcGFjaXR5PSIwLjMiIGN4PSI0MCIgY3k9IjQwIiByPSI2Ii8+PGNpcmNsZSBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMiIgY3g9IjEwIiBjeT0iMTAiIHI9IjQiLz48Y2lyY2xlIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4yNSIgY3g9IjcwIiBjeT0iNzAiIHI9IjUiLz48cG9seWdvbiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMiIgcG9pbnRzPSI2MCAxMCA2NSAyMCA3MCAxMCIvPjwvZz48L3N2Zz4=')] opacity-40" />
          
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="mx-auto mb-8 flex w-fit items-center justify-center gap-3 rounded-3xl bg-white/90 px-6 py-3 shadow-2xl backdrop-blur-sm">
                <div 
                  className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg"
                  style={{ background: 'linear-gradient(to bottom right, #ec4899, #db2777)' }}
                >
                  <Sparkles className="h-7 w-7 text-white" />
                </div>
                <div className="h-10 w-px bg-gray-200" />
                <div 
                  className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg"
                  style={{ background: 'linear-gradient(to bottom right, #14b8a6, #0d9488)' }}
                >
                  <Heart className="h-7 w-7 text-white" />
                </div>
              </div>
              
              <h1 className="text-balance font-bold text-5xl text-gray-900 sm:text-6xl md:text-7xl lg:text-8xl leading-tight">
                Välkommen till våra{' '}
                <span className="text-pink-500 font-extrabold">bloggar</span>!
              </h1>
              <p className="mx-auto mt-8 max-w-2xl text-pretty text-xl text-gray-700 sm:text-2xl leading-relaxed font-medium">
                Följ med Zelda och Blanka på deras äventyr! Här delar vi med oss av pyssel, fotboll, godis, choklad och allt roligt som händer i våra liv.
              </p>
              
              <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <a
                  href="/zelda"
                  className="group flex w-full items-center justify-center gap-3 rounded-2xl px-10 py-5 font-bold text-lg text-white shadow-lg transition-all hover:scale-105 hover:-translate-y-1 sm:w-auto"
                  style={{ background: 'linear-gradient(to right, #ec4899, #db2777)', boxShadow: '0 10px 30px -10px rgba(236, 72, 153, 0.4)' }}
                >
                  <Sparkles className="h-6 w-6 transition-transform group-hover:rotate-12" />
                  Zeldas blogg
                </a>
                <a
                  href="/blanka"
                  className="group flex w-full items-center justify-center gap-3 rounded-2xl px-10 py-5 font-bold text-lg text-white shadow-lg transition-all hover:scale-105 hover:-translate-y-1 sm:w-auto"
                  style={{ background: 'linear-gradient(to right, #14b8a6, #0d9488)', boxShadow: '0 10px 30px -10px rgba(20, 184, 166, 0.4)' }}
                >
                  <Heart className="h-6 w-6 transition-transform group-hover:scale-110" />
                  Blankas blogg
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Adventures Photo Gallery Section */}
        <section className="py-16 sm:py-24 bg-gradient-to-br from-amber-50 via-pink-50 to-cyan-50 overflow-hidden">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-16 text-center">
              <h2 className="text-balance font-bold text-4xl text-gray-900 sm:text-5xl mb-4">
                Våra äventyr
              </h2>
              <p className="text-pretty text-xl text-gray-600 max-w-2xl mx-auto">
                Kolla in alla roliga saker vi gör! Bad, klättring, godis och mycket mer!
              </p>
            </div>

            {/* Polaroid-style Photo Grid */}
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {/* Photo 1 - Beach fun */}
              <div className="group relative bg-white p-3 pb-16 rounded-lg shadow-xl transition-all duration-500 hover:scale-105 hover:rotate-2 hover:shadow-2xl hover:z-10 rotate-[-3deg]">
                <div className="aspect-square overflow-hidden rounded">
                  <img 
                    src="/images/strand.jpg" 
                    alt="Badar i havet" 
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                </div>
                <p className="absolute bottom-4 left-0 right-0 text-center font-handwriting text-lg text-gray-700">
                  Badar i havet!
                </p>
              </div>

              {/* Photo 2 - Climbing */}
              <div className="group relative bg-white p-3 pb-16 rounded-lg shadow-xl transition-all duration-500 hover:scale-105 hover:-rotate-2 hover:shadow-2xl hover:z-10 rotate-[2deg] sm:mt-8">
                <div className="aspect-square overflow-hidden rounded">
                  <img 
                    src="/images/klattring.jpg" 
                    alt="Klättrar" 
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                </div>
                <p className="absolute bottom-4 left-0 right-0 text-center font-handwriting text-lg text-gray-700">
                  Klättrar som proffs!
                </p>
              </div>

              {/* Photo 3 - Candy */}
              <div className="group relative bg-white p-3 pb-16 rounded-lg shadow-xl transition-all duration-500 hover:scale-105 hover:rotate-3 hover:shadow-2xl hover:z-10 rotate-[-2deg]">
                <div className="aspect-square overflow-hidden rounded">
                  <img 
                    src="/images/godis.jpg" 
                    alt="Godis" 
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                </div>
                <p className="absolute bottom-4 left-0 right-0 text-center font-handwriting text-lg text-gray-700">
                  Mmm, godis!
                </p>
              </div>

              {/* Photo 4 - Football */}
              <div className="group relative bg-white p-3 pb-16 rounded-lg shadow-xl transition-all duration-500 hover:scale-105 hover:-rotate-3 hover:shadow-2xl hover:z-10 rotate-[3deg] sm:mt-4">
                <div className="aspect-square overflow-hidden rounded">
                  <img 
                    src="/images/fotboll.jpg" 
                    alt="Fotboll" 
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                </div>
                <p className="absolute bottom-4 left-0 right-0 text-center font-handwriting text-lg text-gray-700">
                  Fotboll!
                </p>
              </div>

              {/* Photo 5 - Palma */}
              <div className="group relative bg-white p-3 pb-16 rounded-lg shadow-xl transition-all duration-500 hover:scale-105 hover:rotate-2 hover:shadow-2xl hover:z-10 rotate-[-1deg] sm:mt-2">
                <div className="aspect-square overflow-hidden rounded">
                  <img 
                    src="/images/palma.jpg" 
                    alt="Palma de Mallorca" 
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                </div>
                <p className="absolute bottom-4 left-0 right-0 text-center font-handwriting text-lg text-gray-700">
                  Semester!
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Latest Posts Section */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="text-balance font-bold text-3xl text-gray-900 sm:text-4xl">
                Senaste inläggen
              </h2>
              <p className="mt-4 text-pretty text-lg text-gray-600">
                Kolla in vad Zelda och Blanka har skrivit senast!
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post, index) => (
                <BlogCard key={post.id} post={post} delay={index * 0.1} />
              ))}
            </div>

            {posts.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center">
                <p className="text-gray-500">
                  Inga inlägg att visa ännu. Kom tillbaka snart!
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
