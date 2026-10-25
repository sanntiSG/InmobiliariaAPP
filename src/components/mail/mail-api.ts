/** Llamadas del navegador a `/api/dashboard/mail`. Con `agencyId` (sólo el admin) se opera "viendo como" esa inmobiliaria. */
export class MailApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

export async function mailApi<T>(path: string, agencyId: string | null, init?: RequestInit): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `/api/dashboard/mail${path}${agencyId ? `${sep}agencyId=${agencyId}` : ""}`;
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  } catch {
    throw new MailApiError("No pude conectarme. Revisá tu conexión.", 0);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok) throw new MailApiError(data?.error ?? "Algo salió mal. Probá de nuevo.", res.status, data?.code);
  return data as T;
}
