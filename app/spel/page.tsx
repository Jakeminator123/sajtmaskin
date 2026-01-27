'use client';

import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { PacmanGame } from '@/components/pacman-game';
import { Gamepad2, Star, Sparkles, Heart, Puzzle, Dice1, Ghost } from 'lucide-react';
import { useState } from 'react';

export default function SpelPage() {
  const [score, setScore] = useState(0);
  const [clickedStars, setClickedStars] = useState<number[]>([]);

  const handleStarClick = (index: number) => {
    if (!clickedStars.includes(index)) {
      setClickedStars([...clickedStars, index]);
      setScore(score + 10);
    }
  };

  const resetGame = () => {
    setClickedStars([]);
    setScore(0);
  };

  const games = [
    {
      title: 'Pac-Man',
      description: 'Klassiskt arkadspel - at prickarna och undvik spokena!',
      icon: Ghost,
      color: 'from-yellow-400 to-yellow-600',
      available: true,
    },
    {
      title: 'Klicka-spelet',
      description: 'Klicka pa stjarnorna och samla poang!',
      icon: Star,
      color: 'from-candy-yellow to-candy-orange',
      available: true,
    },
    {
      title: 'Memory',
      description: 'Hitta matchande par av kort!',
      icon: Puzzle,
      color: 'from-zelda-pink to-zelda-pink-dark',
      available: false,
    },
    {
      title: 'Gissa numret',
      description: 'Kan du gissa ratt nummer?',
      icon: Dice1,
      color: 'from-blanka-teal to-blanka-teal-dark',
      available: false,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section 
          className="relative overflow-hidden border-b-4 border-candy-purple py-24 sm:py-32"
          style={{ background: 'linear-gradient(to bottom right, #f3e8ff, #e9d5ff, #d8b4fe)' }}
        >
          <div className="absolute inset-0 overflow-hidden">
            {/* Floating animated elements */}
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute animate-bounce"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${2 + Math.random() * 3}s`,
                }}
              >
                {i % 3 === 0 ? (
                  <Star className="h-6 w-6 text-candy-yellow opacity-60" />
                ) : i % 3 === 1 ? (
                  <Sparkles className="h-5 w-5 text-zelda-pink opacity-50" />
                ) : (
                  <Heart className="h-4 w-4 text-blanka-teal opacity-40" />
                )}
              </div>
            ))}
          </div>
          
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center text-center">
              <div 
                className="mb-8 flex h-32 w-32 items-center justify-center rounded-3xl bg-white shadow-2xl transition-transform hover:rotate-12 hover:scale-110"
                style={{ boxShadow: '0 25px 50px -12px rgba(168, 85, 247, 0.4)' }}
              >
                <Gamepad2 className="h-16 w-16 text-candy-purple" />
              </div>
              
              <h1 className="text-balance font-bold text-6xl text-foreground drop-shadow-lg sm:text-7xl md:text-8xl">
                Spel
              </h1>
              <p className="mx-auto mt-8 max-w-2xl text-pretty text-xl text-foreground/80 sm:text-2xl font-medium leading-relaxed">
                Roliga spel att spela! Klicka, samla poäng och ha kul!
              </p>
            </div>
          </div>
        </section>

        {/* Pac-Man Game Section */}
        <section className="py-16 sm:py-24 bg-gradient-to-b from-indigo-950 to-gray-900">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="text-balance font-bold text-3xl text-yellow-400 sm:text-4xl">
                Pac-Man
              </h2>
              <p className="mt-4 text-pretty text-lg text-gray-300">
                At alla prickar och undvik spokena! Stora prickar ger dig kraft att ata spokena.
              </p>
            </div>
            
            <PacmanGame />
          </div>
        </section>

        {/* Click Game Section */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="text-balance font-bold text-3xl text-foreground sm:text-4xl">
                Klicka-spelet
              </h2>
              <p className="mt-4 text-pretty text-lg text-muted-foreground">
                Klicka pa alla stjarnor och samla poang!
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-candy-yellow/20 px-6 py-3">
                <Star className="h-6 w-6 text-candy-yellow" />
                <span className="font-bold text-2xl text-foreground">Poang: {score}</span>
              </div>
            </div>

            {/* Game Area */}
            <div className="relative mx-auto max-w-2xl rounded-3xl border-4 border-candy-purple/30 bg-gradient-to-br from-white to-purple-50 p-8 shadow-2xl">
              <div className="grid grid-cols-5 gap-4">
                {[...Array(15)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => handleStarClick(i)}
                    disabled={clickedStars.includes(i)}
                    className={`
                      aspect-square rounded-2xl border-2 transition-all duration-300
                      ${clickedStars.includes(i) 
                        ? 'bg-green-100 border-green-300 scale-90 opacity-50' 
                        : 'bg-white border-candy-yellow/50 hover:scale-110 hover:rotate-12 hover:border-candy-yellow hover:shadow-lg cursor-pointer active:scale-95'
                      }
                    `}
                  >
                    <Star 
                      className={`h-full w-full p-3 transition-colors ${
                        clickedStars.includes(i) ? 'text-green-400' : 'text-candy-yellow'
                      }`} 
                    />
                  </button>
                ))}
              </div>
              
              {clickedStars.length === 15 && (
                <div className="mt-8 text-center animate-bounce">
                  <p className="font-bold text-2xl text-candy-purple">
                    Grattis! Du hittade alla stjärnor!
                  </p>
                  <button
                    onClick={resetGame}
                    className="mt-4 rounded-xl bg-gradient-to-r from-candy-purple to-zelda-pink px-8 py-3 font-bold text-white shadow-lg transition-all hover:scale-105 hover:-translate-y-1"
                  >
                    Spela igen
                  </button>
                </div>
              )}
              
              {clickedStars.length > 0 && clickedStars.length < 15 && (
                <div className="mt-6 text-center">
                  <p className="text-muted-foreground">
                    {15 - clickedStars.length} stjärnor kvar att hitta!
                  </p>
                </div>
              )}
            </div>

            {clickedStars.length > 0 && (
              <div className="mt-6 text-center">
                <button
                  onClick={resetGame}
                  className="text-muted-foreground hover:text-foreground underline transition-colors"
                >
                  Börja om
                </button>
              </div>
            )}
          </div>
        </section>

        {/* More Games Coming Soon */}
        <section className="bg-muted/30 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="text-balance font-bold text-3xl text-foreground sm:text-4xl">
                Fler spel kommer snart!
              </h2>
              <p className="mt-4 text-pretty text-lg text-muted-foreground">
                Vi jobbar på fler roliga spel. Kom tillbaka snart!
              </p>
            </div>

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((game, index) => {
                const Icon = game.icon;
                return (
                  <div
                    key={game.title}
                    className={`
                      group relative overflow-hidden rounded-3xl border-2 bg-white p-8 shadow-xl transition-all
                      ${game.available 
                        ? 'border-white/50 hover:scale-105 hover:-translate-y-2 hover:shadow-2xl cursor-pointer' 
                        : 'border-dashed border-muted opacity-70'
                      }
                    `}
                  >
                    <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${game.color} opacity-10 blur-2xl`} />
                    <div className={`relative mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${game.color} shadow-lg transition-transform ${game.available ? 'group-hover:rotate-6 group-hover:scale-110' : ''}`}>
                      <Icon className="h-10 w-10 text-white" />
                    </div>
                    <h3 className="mb-3 font-bold text-xl text-foreground">{game.title}</h3>
                    <p className="text-pretty text-muted-foreground leading-relaxed">
                      {game.description}
                    </p>
                    {!game.available && (
                      <span className="mt-4 inline-block rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">
                        Kommer snart
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Image Gallery */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="text-balance font-bold text-3xl text-foreground sm:text-4xl">
                Roliga bilder
              </h2>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="group relative aspect-video overflow-hidden rounded-3xl shadow-xl transition-all hover:scale-105 hover:shadow-2xl">
                <img 
                  src="/images/godis.jpg" 
                  alt="Godis" 
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <p className="absolute bottom-4 left-4 font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Mmm, godis!
                </p>
              </div>
              <div className="group relative aspect-video overflow-hidden rounded-3xl shadow-xl transition-all hover:scale-105 hover:shadow-2xl">
                <img 
                  src="/images/fotboll.jpg" 
                  alt="Fotboll" 
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <p className="absolute bottom-4 left-4 font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Fotboll är kul!
                </p>
              </div>
              <div className="group relative aspect-video overflow-hidden rounded-3xl shadow-xl transition-all hover:scale-105 hover:shadow-2xl">
                <img 
                  src="/images/palma.jpg" 
                  alt="Palma de Mallorca" 
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <p className="absolute bottom-4 left-4 font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Palma de Mallorca
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
