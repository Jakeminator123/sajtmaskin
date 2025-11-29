// Mock generator for testing before API integration
// This simulates v0 API responses

interface MockResponse {
  message: string;
  code: string;
}

// Category-specific mock responses
const categoryResponses: Record<string, MockResponse> = {
  "landing-page": {
    message:
      "Här är din landing page! Jag har skapat en modern design med hero-sektion, funktioner, och en call-to-action. Du kan förfina den genom att beskriva ändringar i chatten.",
    code: `// Landing Page Component
import React from 'react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800">
      {/* Hero Section */}
      <header className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold text-white mb-6">
          Välkommen till Framtiden
        </h1>
        <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
          En modern lösning för moderna problem. Kom igång idag.
        </p>
        <button className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-semibold">
          Kom igång
        </button>
      </header>

      {/* Features */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          {['Snabb', 'Säker', 'Skalbar'].map((feature) => (
            <div key={feature} className="bg-slate-800 p-6 rounded-xl">
              <h3 className="text-xl font-semibold text-white mb-2">{feature}</h3>
              <p className="text-slate-400">Lorem ipsum dolor sit amet.</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}`,
  },
  website: {
    message:
      "Jag har skapat en komplett hemsida med navigation och flera sektioner. Säg till om du vill ändra färger, layout eller lägga till fler sidor!",
    code: `// Website Component
import React from 'react';

export default function Website() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="bg-slate-900 text-white py-4">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <span className="text-xl font-bold">Företaget</span>
          <div className="space-x-6">
            <a href="#" className="hover:text-blue-400">Hem</a>
            <a href="#" className="hover:text-blue-400">Om oss</a>
            <a href="#" className="hover:text-blue-400">Tjänster</a>
            <a href="#" className="hover:text-blue-400">Kontakt</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-4">Välkommen till Företaget</h1>
          <p className="text-xl opacity-90">Vi hjälper dig att lyckas</p>
        </div>
      </section>

      {/* Content */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-8">Våra Tjänster</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-6 hover:shadow-lg transition">
              <h3 className="text-xl font-semibold mb-2">Tjänst {i}</h3>
              <p className="text-gray-600">Beskrivning av tjänsten.</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}`,
  },
  dashboard: {
    message:
      "Din dashboard är klar! Den innehåller statistikkort, ett diagram och en tabell. Vill du lägga till fler widgets eller ändra layouten?",
    code: `// Dashboard Component
import React from 'react';

export default function Dashboard() {
  const stats = [
    { label: 'Användare', value: '12,345' },
    { label: 'Intäkter', value: '45,678 kr' },
    { label: 'Beställningar', value: '892' },
    { label: 'Konvertering', value: '3.2%' },
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-900 text-white p-4">
        <h2 className="text-xl font-bold mb-8">Dashboard</h2>
        <nav className="space-y-2">
          {['Översikt', 'Statistik', 'Användare', 'Inställningar'].map((item) => (
            <a key={item} href="#" className="block py-2 px-4 rounded hover:bg-slate-800">
              {item}
            </a>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="ml-64 p-8">
        <h1 className="text-2xl font-bold mb-6">Översikt</h1>
        
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white p-4 rounded-lg shadow">
              <p className="text-gray-500 text-sm">{stat.label}</p>
              <p className="text-2xl font-bold">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-4">Senaste aktivitet</h3>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Användare</th>
                <th className="text-left py-2">Åtgärd</th>
                <th className="text-left py-2">Datum</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((i) => (
                <tr key={i} className="border-b">
                  <td className="py-2">Användare {i}</td>
                  <td className="py-2">Loggade in</td>
                  <td className="py-2">2024-01-0{i}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}`,
  },
  ecommerce: {
    message:
      "Här är din webbshop! Jag har skapat en produktlista med filter. Du kan be mig lägga till kundvagn, produktsidor eller ändra designen.",
    code: `// E-commerce Component
import React from 'react';

export default function Ecommerce() {
  const products = [
    { id: 1, name: 'Produkt 1', price: 299, image: '🎧' },
    { id: 2, name: 'Produkt 2', price: 499, image: '⌚' },
    { id: 3, name: 'Produkt 3', price: 199, image: '📱' },
    { id: 4, name: 'Produkt 4', price: 899, image: '💻' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <span className="text-2xl font-bold">Butiken</span>
          <div className="flex items-center gap-4">
            <input
              type="search"
              placeholder="Sök produkter..."
              className="px-4 py-2 border rounded-lg"
            />
            <button className="relative">
              🛒
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                3
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Products */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {products.map((product) => (
            <div key={product.id} className="bg-white rounded-lg shadow hover:shadow-lg transition p-4">
              <div className="text-6xl text-center py-8">{product.image}</div>
              <h3 className="font-semibold">{product.name}</h3>
              <p className="text-blue-600 font-bold">{product.price} kr</p>
              <button className="mt-2 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-500">
                Lägg i kundvagn
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}`,
  },
  blog: {
    message:
      "Din blogg är redo! Den har en artikellista och sidebar. Säg till om du vill ha kategorier, sökfunktion eller nyhetsbrev-signup!",
    code: `// Blog Component
import React from 'react';

export default function Blog() {
  const posts = [
    { id: 1, title: 'Första inlägget', excerpt: 'Lorem ipsum dolor sit amet...', date: '2024-01-15' },
    { id: 2, title: 'Andra inlägget', excerpt: 'Consectetur adipiscing elit...', date: '2024-01-10' },
    { id: 3, title: 'Tredje inlägget', excerpt: 'Sed do eiusmod tempor...', date: '2024-01-05' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold">Min Blogg</h1>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Articles */}
          <div className="md:col-span-2 space-y-6">
            {posts.map((post) => (
              <article key={post.id} className="bg-white rounded-lg shadow p-6">
                <span className="text-sm text-gray-500">{post.date}</span>
                <h2 className="text-xl font-bold mt-1 mb-2">{post.title}</h2>
                <p className="text-gray-600">{post.excerpt}</p>
                <a href="#" className="text-blue-600 hover:underline mt-2 inline-block">
                  Läs mer →
                </a>
              </article>
            ))}
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-bold mb-4">Kategorier</h3>
              <ul className="space-y-2">
                {['Teknik', 'Design', 'Livsstil'].map((cat) => (
                  <li key={cat}>
                    <a href="#" className="text-blue-600 hover:underline">{cat}</a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}`,
  },
  portfolio: {
    message:
      "Portfolion är skapad! Den visar dina projekt i ett snyggt galleri. Vill du ändra layouten eller lägga till en om mig-sektion?",
    code: `// Portfolio Component
import React from 'react';

export default function Portfolio() {
  const projects = [
    { id: 1, title: 'Projekt Alpha', category: 'Webb' },
    { id: 2, title: 'Projekt Beta', category: 'App' },
    { id: 3, title: 'Projekt Gamma', category: 'Design' },
    { id: 4, title: 'Projekt Delta', category: 'Webb' },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Hero */}
      <header className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold mb-4">Kreativ Portfolio</h1>
        <p className="text-xl text-slate-400">Designer & Utvecklare</p>
      </header>

      {/* Projects */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold mb-8">Projekt</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group relative bg-slate-800 rounded-xl overflow-hidden hover:scale-105 transition"
            >
              <div className="aspect-video bg-gradient-to-br from-blue-600 to-purple-600" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <span className="text-lg font-semibold">Visa projekt</span>
              </div>
              <div className="p-4">
                <span className="text-sm text-blue-400">{project.category}</span>
                <h3 className="text-lg font-semibold">{project.title}</h3>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold mb-4">Kontakta mig</h2>
        <a href="mailto:hello@example.com" className="text-blue-400 hover:underline">
          hello@example.com
        </a>
      </section>
    </div>
  );
}`,
  },
  webapp: {
    message:
      "Din web app är redo! Jag har skapat ett grundläggande gränssnitt. Beskriv vilka funktioner du vill ha så bygger jag vidare!",
    code: `// Web App Component
import React, { useState } from 'react';

export default function WebApp() {
  const [items, setItems] = useState(['Uppgift 1', 'Uppgift 2', 'Uppgift 3']);
  const [newItem, setNewItem] = useState('');

  const addItem = () => {
    if (newItem.trim()) {
      setItems([...items, newItem]);
      setNewItem('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-blue-600 text-white py-4">
        <div className="container mx-auto px-4">
          <h1 className="text-xl font-bold">Min App</h1>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-8 max-w-md">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Att göra</h2>
          
          {/* Add form */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Ny uppgift..."
              className="flex-1 px-3 py-2 border rounded"
            />
            <button
              onClick={addItem}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500"
            >
              Lägg till
            </button>
          </div>

          {/* List */}
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded">
                <input type="checkbox" className="rounded" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}`,
  },
};

// Default response for custom prompts
const defaultResponse: MockResponse = {
  message:
    "Jag har skapat en grundläggande design baserat på din beskrivning. Du kan förfina den genom att ge mig mer specifika instruktioner!",
  code: `// Custom Component
import React from 'react';

export default function CustomPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl font-bold mb-4">Din Webbplats</h1>
        <p className="text-slate-400">
          Beskriv vad du vill ändra så uppdaterar jag designen.
        </p>
      </div>
    </div>
  );
}`,
};

// Refinement responses
const refinementResponses = [
  "Klart! Jag har uppdaterat designen enligt dina önskemål.",
  "Ändringarna är gjorda! Kolla förhandsvisningen till höger.",
  "Perfekt, jag har justerat koden. Vad tycker du?",
  "Uppdaterat! Säg till om du vill ändra något mer.",
];

/**
 * Simulates AI response with realistic delay
 */
export async function generateMockResponse(
  prompt: string,
  categoryType?: string
): Promise<MockResponse> {
  // Simulate API delay (2-4 seconds)
  const delay = 2000 + Math.random() * 2000;
  await new Promise((resolve) => setTimeout(resolve, delay));

  // Return category-specific response or default
  if (categoryType && categoryResponses[categoryType]) {
    return categoryResponses[categoryType];
  }

  return defaultResponse;
}

/**
 * Simulates refinement response
 */
export async function generateMockRefinement(
  instruction: string
): Promise<MockResponse> {
  // Simulate shorter delay for refinements
  const delay = 1500 + Math.random() * 1500;
  await new Promise((resolve) => setTimeout(resolve, delay));

  const randomMessage =
    refinementResponses[Math.floor(Math.random() * refinementResponses.length)];

  return {
    message: randomMessage,
    code: `// Updated code based on: "${instruction.slice(0, 50)}..."
// (Mock update - real code generation comes in Phase 4)`,
  };
}

