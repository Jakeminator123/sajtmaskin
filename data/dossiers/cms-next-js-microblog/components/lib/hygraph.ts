import { GraphQLClient } from 'graphql-request'

const endpoint = process.env.HYGRAPH_ENDPOINT

if (!endpoint) {
  throw new Error('Missing HYGRAPH_ENDPOINT environment variable')
}

export const hygraph = new GraphQLClient(endpoint, {
  headers: process.env.HYGRAPH_TOKEN
    ? {
        Authorization: `Bearer ${process.env.HYGRAPH_TOKEN}`,
      }
    : {},
})
