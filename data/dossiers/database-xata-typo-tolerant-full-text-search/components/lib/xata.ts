import 'server-only'
import { XataClient } from '@xata.io/client'

const apiKey = process.env.XATA_API_KEY
const databaseUrl = process.env.XATA_DATABASE_URL

if (!apiKey) {
  throw new Error('Missing XATA_API_KEY')
}

if (!databaseUrl) {
  throw new Error('Missing XATA_DATABASE_URL')
}

export const xata = new XataClient({
  apiKey,
  databaseURL: databaseUrl,
})
