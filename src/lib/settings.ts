// src/lib/settings.ts
export type AppSettings = {
    tenantName: string;            // 고객사/테넌트 표시명
    backendBaseUrl: string;        // 예: http://localhost:8080 or https://api.example.com
    googleFormUrl: string;         // 구글폼 URL (연동용 저장)
    notifyEmailFrom: string;       // 알림 발신 표시 이메일(표시용)
    enableEmailNotify: boolean;    // 메인 토글
    qrTtlMinutes: number;          // QR 인증 유효시간(분)
};

const KEY = "event_manager_settings_v1";

export const defaultSettings: AppSettings = {
    tenantName: "Default Tenant",
    backendBaseUrl: "",
    googleFormUrl: "",
    notifyEmailFrom: "",
    enableEmailNotify: false,
    qrTtlMinutes: 30,
};

export function loadSettingsClient(): AppSettings {
    if (typeof window === "undefined") return defaultSettings;
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return defaultSettings;
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        return {
            ...defaultSettings,
            ...parsed,
            // 방어: 숫자 필드
            qrTtlMinutes:
                typeof parsed.qrTtlMinutes === "number" && Number.isFinite(parsed.qrTtlMinutes)
                    ? parsed.qrTtlMinutes
                    : defaultSettings.qrTtlMinutes,
        };
    } catch {
        return defaultSettings;
    }
}

export function saveSettingsClient(next: AppSettings) {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify(next));
}

export function clearSettingsClient() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(KEY);
}