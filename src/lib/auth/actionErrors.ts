export const AUTH_REQUIRED_MESSAGE = "ログインし直してください";

export function isAuthRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message === "auth_required";
}

export function authRequiredMessage(error: unknown): string | null {
  return isAuthRequiredError(error) ? AUTH_REQUIRED_MESSAGE : null;
}
