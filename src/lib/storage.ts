export function getStorage<T>(key: string, defaultValue: T): T {
    if (typeof window === "undefined") return defaultValue;

    try {
        const raw = localStorage.getItem(key);
        if (!raw) return defaultValue;
        return JSON.parse(raw) as T;
    } catch {
        return defaultValue;
    }
}

export function setStorage<T>(key: string, value: T) {
    if (typeof window === "undefined") return;

    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error("storage set error", e);
    }
}

export function removeStorage(key: string) {
    if (typeof window === "undefined") return;
    localStorage.removeItem(key);
}