import Link from 'next/link'
import { getPosts } from '@/components/lib/queries'

export const revalidate = 60

export default async function BlogPage() {
  const posts = await getPosts()

  return (
    <main>
      <h1>Blog</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`}>{post.title}</Link>
            {post.excerpt ? <p>{post.excerpt}</p> : null}
          </li>
        ))}
      </ul>
    </main>
  )
}
