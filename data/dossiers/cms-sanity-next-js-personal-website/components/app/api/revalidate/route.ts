import {parseBody} from 'next-sanity/webhook'
import {revalidateTag} from 'next/cache'

const webhookSecret = process.env.SANITY_REVALIDATE_SECRET

export async function POST(req: Request) {
  if (!webhookSecret) {
    return new Response('Missing SANITY_REVALIDATE_SECRET', {status: 500})
  }

  const {isValidSignature, body} = await parseBody<{_type?: string; slug?: string}>(req, webhookSecret)

  if (!isValidSignature) {
    return new Response('Invalid signature', {status: 401})
  }

  revalidateTag('sanity')

  if (body?._type) {
    revalidateTag(body._type)
  }

  if (body?.slug) {
    revalidateTag(body.slug)
  }

  return Response.json({ok: true})
}
