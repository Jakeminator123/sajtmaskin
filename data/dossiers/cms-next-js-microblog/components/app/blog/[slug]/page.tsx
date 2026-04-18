import { notFound } from 'next/navigation'
import { getPost, getPostSlugs } from '@/components/lib/queries'

export const revalidate = 60

export async function generateStaticParams() {
  const slugs = await getPostSlugs()
  return slugs.map((slug) => ({ slug }))
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)

  if (!post) {
    notFound()
  }

  return (
    <article>
      <h1>{post.title}</h1>
      {post.excerpt ? <p>{post.excerpt}</p> : null}
      {post.content?.html ? (
        <div dangerouslySetInnerHTML={{ __html: post.content.html }} />
      ) : null}
    </article>
  )
}
