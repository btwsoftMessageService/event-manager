// src/lib/api.ts

export type ApiResult<T> =
    | { ok: true; data: T }
    | { ok: false; message: string; status?: number };

type ApiErrorBody = {
    message?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return fallback;
}

function parseApiErrorBody(text: string): ApiErrorBody | null {
    if (!text) return null;

    try {
        return JSON.parse(text) as ApiErrorBody;
    } catch {
        return null;
    }
}

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
        const json = parseApiErrorBody(text);

        if (!res.ok) {
            return {
                ok: false,
                status: res.status,
                message: json?.message ?? `Request failed (${res.status})`,
            };
        }

        return {
            ok: true,
            data: (text ? JSON.parse(text) : null) as T,
        };
    } catch (error: unknown) {
        return {
            ok: false,
            message: getErrorMessage(error, "Network error"),
        };
    }
}