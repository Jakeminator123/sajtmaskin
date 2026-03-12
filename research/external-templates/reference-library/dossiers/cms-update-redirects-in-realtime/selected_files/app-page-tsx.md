# app/page.tsx

Reason: Useful structural reference

```text
import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="py-24 px-4 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-black dark:text-white mb-6">
            Essential Carry
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto">
            Thoughtfully designed everyday essentials for work, travel, and life.
            Minimalist aesthetics meet maximum functionality.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/catalog/fall"
              className="inline-flex items-center justify-center bg-black dark:bg-white text-white dark:text-black px-8 py-3 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              Shop Fall Collection
            </Link>
            <Link
              href="/catalog/latest"
              className="inline-flex items-center justify-center border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 px-8 py-3 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
            >
              View Latest
            </Link>
          </div>
        </div>
      </section>

      {/* Collections Grid */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-black dark:text-white mb-4">
              Shop by Season
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
              Discover our curated collections, each designed for specific moments and seasons.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Fall */}
            <Link href="/catalog/fall" className="group block">
              <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-8 h-64 flex flex-col justify-between hover:border-black dark:hover:border-white transition-colors">
                <div>

// ... truncated
```
