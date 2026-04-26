interface ClientDataResponse<T> {
  data?: T;
  error?: string;
}

export async function fetchClientData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({})) as ClientDataResponse<T>;

  if (!response.ok) {
    throw new Error(body.error ?? "Failed to fetch client data");
  }

  return body.data as T;
}
