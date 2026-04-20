import { gql } from 'graphql-request'
import { hygraph } from './hygraph'

export type PostSummary = {
  slug: string
  title: string
  excerpt?: string | null
  publishedAt?: string | null
}

export type Post = PostSummary & {
  content?: {
    html?: string | null
  } | null
}

const POSTS_QUERY = gql`
  query Posts {
    posts(orderBy: publishedAt_DESC) {
      slug
      title
      excerpt
      publishedAt
    }
  }
`

const POST_QUERY = gql`
  query PostBySlug($slug: String!) {
    post(where: { slug: $slug }) {
      slug
      title
      excerpt
      publishedAt
      content {
        html
      }
    }
  }
`

const SLUGS_QUERY = gql`
  query PostSlugs {
    posts {
      slug
    }
  }
`

export async function getPosts(): Promise<PostSummary[]> {
  const data = await hygraph.request<{ posts: PostSummary[] }>(POSTS_QUERY)
  return data.posts
}

export async function getPost(slug: string): Promise<Post | null> {
  const data = await hygraph.request<{ post: Post | null }>(POST_QUERY, { slug })
  return data.post
}

export async function getPostSlugs(): Promise<string[]> {
  const data = await hygraph.request<{ posts: Array<{ slug: string }> }>(SLUGS_QUERY)
  return data.posts.map((post) => post.slug)
}
