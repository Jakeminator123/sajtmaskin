import Link from 'next/link'
import { allPosts } from 'contentlayer/generated'

export default function BlogIndexPage() {
  const posts = allPosts
    .filter((post) => post.published !== false)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">Blog</h1>
        <p className="text-muted-foreground">Posts authored in local MDX files.</p>
      </header>

      <ul className="space-y-6">
        {posts.map((post) => (
          <li key={post._id}>
            <Link href={post.url} className="block space-y-1">
              <h2 className="text-xl font-medium">{post.title}</h2>
              {post.description ? <p>{post.description}</p> : null}
              <time dateTime={post.date} className="text-sm opacity-70">
                {new Date(post.date).toLocaleDateString()}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
