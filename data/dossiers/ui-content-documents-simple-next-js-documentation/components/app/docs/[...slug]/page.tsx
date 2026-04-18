import { notFound } from 'next/navigation'
import { getDocument, getPreviousNext } from '@/lib/markdown'

function slugToPath(slug: string[] | undefined) {
  if (!slug || slug.length === 0) return 'index'
  return slug.join('/')
}

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const path = slugToPath(slug)
  const doc = await getDocument(path)

  if (!doc) notFound()

  const navigation = getPreviousNext(path)

  return (
    <article className="prose max-w-none">
      <header>
        <h1>{doc.frontmatter.title}</h1>
        {doc.frontmatter.description ? <p>{doc.frontmatter.description}</p> : null}
      </header>

      <div>{doc.content}</div>

      <nav aria-label="Document pagination">
        {navigation.prev ? <a href={navigation.prev.href}>← {navigation.prev.title}</a> : null}
        {navigation.next ? <a href={navigation.next.href}>{navigation.next.title} →</a> : null}
      </nav>
    </article>
  )
}
