import { allPosts } from 'contentlayer/generated'
import { notFound } from 'next/navigation'
import { Mdx } from '@/components/mdx-components'

interface BlogPostPageProps {
  params: {
    slug: string
  }
}

export async function generateStaticParams() {
  return allPosts
    .filter((post) => post.published !== false)
    .map((post) => ({ slug: post.slug }))
}

export default function BlogPostPage({ params }: BlogPostPageProps) {
  const post = allPosts.find((entry) => entry.slug === params.slug && entry.published !== false)

  if (!post) notFound()

  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none">
      <header className="mb-8">
        <h1>{post.title}</h1>
        <p>{post.description}</p>
        <time dateTime={post.date}>{new Date(post.date).toLocaleDateString()}</time>
      </header>
      <Mdx code={post.body.code} />
    </article>
  )
}
