import { SignJWT, jwtVerify } from "jose"

const secret = new TextEncoder().encode(process.env.API_SECRET || "")

export type GenerationTokenPayload = {
  ip?: string
  isIOS?: boolean
}

export async function createGenerationToken(payload: GenerationTokenPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(secret)
}

export async function verifyGenerationToken(token: string) {
  const { payload } = await jwtVerify(token, secret)
  return payload
}
