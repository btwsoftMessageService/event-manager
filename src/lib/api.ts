// src/lib/api.ts

export type ApiResult<T> =
    | { ok: true; data: T }
    | { ok: false; message: string; status?: number };

export async function postJson<T>(
    url: string,
    body: unknown,
    init?: RequestInit
): Promise<ApiResult<T>> {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body),
            ...init,
        });

        const text = await res.text();
        const json = text ? JSON.parse(text) : null;

        if (!res.ok) {
            return {
                ok: false,
                status: res.status,
                message: json?.message ?? `Request failed (${res.status})`,
            };
        }

        return {ok: true, data: json as T};
    } catch (e: any) {
        return {ok: false, message: e?.message ?? "Network error"};
    }
}
