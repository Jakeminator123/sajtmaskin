import { jwtVerify, SignJWT } from "jose";
import { createCable } from "@anycable/core";

const encoder = new TextEncoder();
const secret = encoder.encode(process.env.ANYCABLE_HTTP_BROADCAST_SECRET || "development-secret");

export const CABLE_URL = process.env.CABLE_URL || "ws://localhost:8080/cable";
export const ANYCABLE_RPC_HOST = process.env.ANYCABLE_RPC_HOST || "http://localhost:3000/api/anycable";

export const cable = createCable({
  url: CABLE_URL,
});

export type CableClaims = {
  sub: string;
  name?: string;
  exp?: number;
};

export const identifier = {
  async issue(claims: CableClaims) {
    return await new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: process.env.ANYCABLE_JWT_ID_KEY || "default" })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);
  },
  async verify(token: string) {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });

    if (!payload.sub || typeof payload.sub !== "string") {
      throw new Error("Invalid token subject");
    }

    return payload;
  },
};
