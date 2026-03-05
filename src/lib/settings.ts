// src/lib/settings.ts
export type AppSettings = {
    tenantName: string;            // 고객사/테넌트 표시명
    backendBaseUrl: string;        // http://localhost:51002 or https://api.btwsoft.com
    googleFormUrl: string;         // 구글폼 URL (연동용 저장)
    notifyEmailFrom: string;       // 알림 발신 표시 이메일(표시용)
    enableEmailNotify: boolean;    // 메인 토글
    qrTtlMinutes: number;          // QR 인증 유효시간(분)

    timezone: string; // "Asia/Seoul"
    locale: "ko" | "en";

    // SMTP
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpUseTls: boolean;

    // Excel import
    excelDuplicateKey: "email" | "phone";
    excelMode: "merge" | "replace";

    // Check-in policy
    checkinAllowDuplicate: boolean;
};

const KEY = "event_manager_settings_v1";

export const defaultSettings: AppSettings = {
    tenantName: "Default Tenant",
    backendBaseUrl: "http://localhost:51002",
    googleFormUrl: "",
    notifyEmailFrom: "support@btwsoft.com",
    enableEmailNotify: false,
    qrTtlMinutes: 30,

    timezone: "Asia/Seoul",
    locale: "ko",

    // SMTP
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPass: "",
    smtpUseTls: true,

    // Excel import
    excelDuplicateKey: "email",
    excelMode: "merge",

    // Check-in policy
    checkinAllowDuplicate: false,
};

function toNumber(v: unknown, fallback: number) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

export function loadSettingsClient(): AppSettings {
    if (typeof window === "undefined") return defaultSettings;

    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return defaultSettings;
        const parsed = JSON.parse(raw) as Partial<AppSettings>;

        // 타입/값 방어적으로 정리해서 리턴
        const next: AppSettings = {
            ...defaultSettings,
            ...parsed,

            // string
            tenantName: String(parsed.tenantName ?? defaultSettings.tenantName),
            backendBaseUrl: String(parsed.backendBaseUrl ?? defaultSettings.backendBaseUrl),
            googleFormUrl: String(parsed.googleFormUrl ?? defaultSettings.googleFormUrl),
            notifyEmailFrom: String(parsed.notifyEmailFrom ?? defaultSettings.notifyEmailFrom),
            timezone: String(parsed.timezone ?? defaultSettings.timezone),

            // boolean
            enableEmailNotify: Boolean(parsed.enableEmailNotify ?? defaultSettings.enableEmailNotify),
            smtpUseTls: Boolean(parsed.smtpUseTls ?? defaultSettings.smtpUseTls),
            checkinAllowDuplicate: Boolean(parsed.checkinAllowDuplicate ?? defaultSettings.checkinAllowDuplicate),

            // number
            qrTtlMinutes: toNumber(parsed.qrTtlMinutes, defaultSettings.qrTtlMinutes),
            smtpPort: toNumber(parsed.smtpPort, defaultSettings.smtpPort),

            // union
            locale: parsed.locale === "en" ? "en" : "ko",
            excelDuplicateKey: parsed.excelDuplicateKey === "phone" ? "phone" : "email",
            excelMode: parsed.excelMode === "replace" ? "replace" : "merge",

            // smtp strings
            smtpHost: String(parsed.smtpHost ?? defaultSettings.smtpHost),
            smtpUser: String(parsed.smtpUser ?? defaultSettings.smtpUser),
            smtpPass: String(parsed.smtpPass ?? defaultSettings.smtpPass),
        };

        return next;
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