import type { User } from "@supabase/supabase-js";

export const AUTH_ACCESS_TOKEN_COOKIE = "bc_auth_access_token";

export function getAllowedAuthEmail(): string | null {
  const value = process.env.NEXT_PUBLIC_ALLOWED_AUTH_EMAIL ?? process.env.ALLOWED_AUTH_EMAIL ?? "";
  const email = value.trim().toLowerCase();
  return email.length > 0 ? email : null;
}

export function isAllowedUserEmail(email: string | null | undefined): boolean {
  const allowedEmail = getAllowedAuthEmail();
  if (!allowedEmail) return true;
  return email?.trim().toLowerCase() === allowedEmail;
}

export function isAllowedUser(user: User | null): user is User {
  return Boolean(user && isAllowedUserEmail(user.email));
}
