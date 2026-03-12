# src/app/page.tsx

Reason: Useful structural reference

```text
"use client"
import { useState } from 'react';

export default function Home() {
  const [status, setStatus] = useState({
    success: true,
    count: 0,
    lastCalled: 'Never',
  });
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('');

  const handleClick = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/increment');
      const data = await res.json();

      if (data.success) {
        setStatus(data);
        setMessage('');
      } else {
        setMessage(data.message || 'Error fetching data.');
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setStatus({
        success: false,
        count: 0,
        lastCalled: 'Unknown',
      });
      setMessage('Error fetching data. Please check the environment variables.');
    } finally {
      setLoading(false)
    }
  };

  return (
    <main className="h-screen">
      <div className="max-w-screen-sm px-8 pt-16 mx-auto pb-44 gap-4 grid">
        {/* header */}
        <header>
          <img
            className="w-10 mb-8"
            src="/upstash-logo.svg"
            alt="upstash logo"
          />

          <h1 className="text-2xl font-semibold text-balance">
            Get Started with Upstash Redis
          </h1>
          <h2 className="text-lg text-balance text-gray-600 dark:text-gray-400">
            This is a simple example to demonstrate Upstash Redis with
            Next.js.
          </h2>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <a
              className="inline-flex items-center gap-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-800"
              href="https://upstash.com/docs/redis/overall/getstarted"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-current text-gray-900 dark:text-gray-100"
              >
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />

// ... truncated
```
