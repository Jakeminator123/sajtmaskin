# app/page.tsx

Reason: Useful structural reference

```text
import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen">
      <section className="py-24 px-4 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-black dark:text-white mb-6">
            Flux
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto">
            Real-time event infrastructure for modern applications. Send, receive, and react to events across your entire stack with a simple API.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/docs"
              className="inline-flex items-center justify-center bg-black dark:bg-white text-white dark:text-black px-8 py-3 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              Read Documentation →
            </Link>
            <a
              href="https://github.com"
              className="inline-flex items-center justify-center border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 px-8 py-3 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-black dark:text-white mb-4">
              Why Flux
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
              Purpose-built for event-driven applications at any scale.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-black dark:text-white mb-2">Simple Integration</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Drop-in SDKs for Node.js, Python, Go, and more. Start sending events in minutes.
              </p>
            </div>

// ... truncated
```
