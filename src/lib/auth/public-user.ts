/**
 * The user shape that auth routes send to the browser (`/api/auth/me`,
 * `/api/auth/login`). One serializer so the routes cannot drift apart.
 *
 * GitHub: only the login and a connected flag leave the server. The OAuth
 * token stays in the database; server routes read it from `getCurrentUser`.
 */
import type { User } from "@/lib/db/services/shared";

export type PublicAuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  diamonds: number;
  freeGenerationAvailable: boolean;
  provider: string | null;
  emailVerified: boolean;
  github_username: string | null;
  github_connected: boolean;
};

type PublicAuthUserSource = Pick<
  User,
  | "id"
  | "email"
  | "name"
  | "image"
  | "diamonds"
  | "free_generation_available"
  | "provider"
  | "email_verified"
  | "github_token"
  | "github_username"
>;

export function toPublicAuthUser(user: PublicAuthUserSource): PublicAuthUser {
  const githubUsername = user.github_username?.trim() || null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    diamonds: user.diamonds,
    freeGenerationAvailable: user.free_generation_available,
    provider: user.provider,
    emailVerified: user.email_verified,
    github_username: githubUsername,
    // Same condition as the export route's "GitHub is not connected" check.
    github_connected: Boolean(user.github_token && githubUsername),
  };
}
