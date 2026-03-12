# src/app/page.tsx

Reason: Useful structural reference

```text
'use client';
import { Github } from 'lucide-react';
import { ModeToggle } from '@/components/mode-toggle';
import Image from 'next/image';
import { Button } from '@/components/button';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function Home() {
  const router = useRouter();

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
      {/* Sticky Header */}
      <header className="sticky top-0 z-10 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800">
        <div className="container mx-auto px-4 py-2 flex justify-between items-center">
          <div className="flex-1">{/* Empty space for layout balance */}</div>
          <nav className="flex-1 flex justify-center">
            {/* Navigation links can be added here */}
          </nav>
          <div className="flex-1 flex gap-2 justify-end">
            <ModeToggle />
            <Button
              onClick={() =>
                router.push('https://github.com/sanjayc208/pinexio')
              }
            >
              <Github className="h-[1.2rem] w-[1.2rem] transition-all" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col justify-center items-center px-4 py-4 md:py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="container mx-auto flex flex-col items-center max-w-6xl"
        >
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex gap-2 lg:gap-4 justify-center xs:px-2"
            >
              <Image
                alt="logo"
                className="h-auto w-auto dark:invert"
                width={100}
                height={100}
                src={`/logos/pinedocs.png`}
              />
              <h1 className="text-5xl content-center md:text-7xl font-stretch-110% -tracking-tighter text-gray-900 dark:text-white">

// ... truncated
```
