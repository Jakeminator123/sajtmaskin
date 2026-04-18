import { WhopSDK } from "@whop-sdk/core";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function getWhopServerSdk() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken;

  if (!token) {
    return { sdk: null, session: null };
  }

  return {
    sdk: new WhopSDK({ TOKEN: token }).userOAuth,
    session,
  };
}
