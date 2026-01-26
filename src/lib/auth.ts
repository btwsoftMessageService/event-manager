// src/lib/auth.ts

const KEY = "event_manager_authed";

export function isAuthedClient(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(KEY) === "1";
}

export function loginClient() {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY, "1");
}

export function logoutClient() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(KEY);
}
