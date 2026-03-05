// src/app/(protected)/settings/page.tsx
"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {isValidEmail} from "@/lib/validators";
import {
    AppSettings,
    clearSettingsClient,
    defaultSettings,
    loadSettingsClient,
    saveSettingsClient,
} from "@/lib/settings";

type Toast = { kind: "success" | "error" | "info"; message: string };

function normalizeUrl(url: string) {
    const v = (url ?? "").trim();
    if (!v) return "";
    return v.replace(/\/+$/, "");
}

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(" ");
}

function Badge({
                   tone = "gray",
                   children,
               }: {
    tone?: "gray" | "green" | "red" | "amber" | "blue";
    children: React.ReactNode;
}) {
    const map: Record<string, string> = {
        gray: "border-zinc-200 bg-zinc-50 text-zinc-700",
        green: "border-green-200 bg-green-50 text-green-800",
        red: "border-red-200 bg-red-50 text-red-800",
        amber: "border-amber-200 bg-amber-50 text-amber-900",
        blue: "border-blue-200 bg-blue-50 text-blue-900",
    };

    return (
        <span
            className={cx(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                map[tone]
            )}
        >
      {children}
    </span>
    );
}

function Card({
                  title,
                  description,
                  right,
                  children,
              }: {
    title: string;
    description?: string;
    right?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
                <div>
                    <div className="text-base font-semibold text-zinc-900">{title}</div>
                    {description ? (
                        <div className="mt-1 text-sm text-zinc-600">{description}</div>
                    ) : null}
                </div>
                {right ? <div className="shrink-0">{right}</div> : null}
            </div>
            <div className="px-5 py-5">{children}</div>
        </section>
    );
}

function Field({
                   label,
                   help,
                   error,
                   children,
                   required,
               }: {
    label: string;
    help?: string;
    error?: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-zinc-800">{label}</label>
                {required ? <Badge tone="amber">필수</Badge> : null}
            </div>
            {children}
            {error ? <div className="text-xs text-red-600">{error}</div> : null}
            {help ? <div className="text-xs text-zinc-500">{help}</div> : null}
        </div>
    );
}

function Switch({
                    checked,
                    onChange,
                    labelLeft,
                    labelRight,
                }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    labelLeft?: string;
    labelRight?: string;
}) {
    return (
        <button type="button"
                onClick={() => onChange(!checked)}
                className={cx(
                    "relative inline-flex h-10 w-[88px] items-center rounded-full border px-1 transition",
                    checked ? "border-zinc-900 bg-zinc-900" : "border-zinc-200 bg-zinc-100"
                )}
                aria-pressed={checked}>
      <span className={cx(
          "inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-semibold shadow transition",
          checked ? "translate-x-[44px] text-zinc-900" : "translate-x-0 text-zinc-700"
      )}>
        {checked ? labelRight ?? "ON" : labelLeft ?? "OFF"}
      </span>
        </button>
    );
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<AppSettings>(defaultSettings);
    const [dirty, setDirty] = useState(false);
    const [toast, setToast] = useState<Toast | null>(null);
    const [health, setHealth] = useState<{ status: "idle" | "ok" | "fail"; detail?: string }>({
        status: "idle",
    });

    const importRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const loaded = loadSettingsClient();
        setSettings(loaded);
        setDirty(false);
    }, []);

    const showToast = (kind: Toast["kind"], message: string) => {
        setToast({kind, message});
        window.setTimeout(() => setToast(null), 2500);
    };

    const onChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setSettings((prev) => ({...prev, [key]: value}));
        setDirty(true);
    };

    // 필수 항목 체크
    const requiredChecks = useMemo(() => {
        const missing: string[] = [];
        if (!settings.backendBaseUrl?.trim()) missing.push("백엔드 Base URL");
        if (settings.enableEmailNotify && !settings.notifyEmailFrom?.trim()) missing.push("공지 수신/발신 이메일");
        if (!Number.isFinite(settings.qrTtlMinutes) || settings.qrTtlMinutes < 1) missing.push("QR TTL");
        return {
            missing,
            done: Math.max(0, 3 - missing.length),
            total: 3,
        };
    }, [settings]);

    const validation = useMemo(() => {
        const errors: Record<string, string> = {};

        // Email
        if (settings.notifyEmailFrom && !isValidEmail(settings.notifyEmailFrom)) {
            errors.notifyEmailFrom = "이메일 형식이 올바르지 않습니다.";
        }

        // QR TTL
        if (settings.qrTtlMinutes < 1 || settings.qrTtlMinutes > 1440) {
            errors.qrTtlMinutes = "QR 유효시간은 1~1440분 범위로 설정하세요.";
        }

        // URL format (입력 시만 검사)
        if (settings.backendBaseUrl && !/^https?:\/\//i.test(settings.backendBaseUrl.trim())) {
            errors.backendBaseUrl = "http(s):// 로 시작해야 합니다.";
        }
        if (settings.googleFormUrl && !/^https?:\/\//i.test(settings.googleFormUrl.trim())) {
            errors.googleFormUrl = "http(s):// 로 시작해야 합니다.";
        }

        // SMTP (smtpHost가 입력된 경우에만 최소 검사)
        if (settings.smtpHost?.trim()) {
            if (!settings.smtpPort || settings.smtpPort < 1 || settings.smtpPort > 65535) {
                errors.smtpPort = "SMTP Port는 1~65535 범위로 설정하세요.";
            }
        }

        return {ok: Object.keys(errors).length === 0, errors};
    }, [settings]);

    const onSave = () => {
        const normalized: AppSettings = {
            ...settings,
            tenantName: settings.tenantName.trim() || defaultSettings.tenantName,

            backendBaseUrl: normalizeUrl(settings.backendBaseUrl),
            googleFormUrl: settings.googleFormUrl.trim(),

            notifyEmailFrom: settings.notifyEmailFrom.trim(),
            qrTtlMinutes: Math.floor(settings.qrTtlMinutes),

            timezone: settings.timezone.trim() || defaultSettings.timezone,
            locale: settings.locale,

            smtpHost: settings.smtpHost.trim(),
            smtpPort: Math.floor(settings.smtpPort),
            smtpUser: settings.smtpUser.trim(),
            smtpPass: settings.smtpPass, // 비밀번호는 trim 안 하는 편이 안전
            smtpUseTls: Boolean(settings.smtpUseTls),

            excelDuplicateKey: settings.excelDuplicateKey,
            excelMode: settings.excelMode,

            checkinAllowDuplicate: Boolean(settings.checkinAllowDuplicate),
        };

        // validate (저장 시 강제)
        if (normalized.notifyEmailFrom && !isValidEmail(normalized.notifyEmailFrom)) {
            showToast("error", "이메일 형식이 올바르지 않습니다.");
            return;
        }
        if (normalized.qrTtlMinutes < 1 || normalized.qrTtlMinutes > 1440) {
            showToast("error", "QR 유효시간은 1~1440분 범위로 설정하세요.");
            return;
        }
        if (normalized.backendBaseUrl && !/^https?:\/\//i.test(normalized.backendBaseUrl)) {
            showToast("error", "백엔드 Base URL은 http(s):// 로 시작해야 합니다.");
            return;
        }
        if (normalized.googleFormUrl && !/^https?:\/\//i.test(normalized.googleFormUrl)) {
            showToast("error", "구글폼 URL은 http(s):// 로 시작해야 합니다.");
            return;
        }
        if (normalized.smtpHost) {
            if (!normalized.smtpPort || normalized.smtpPort < 1 || normalized.smtpPort > 65535) {
                showToast("error", "SMTP Port는 1~65535 범위로 설정하세요.");
                return;
            }
        }

        saveSettingsClient(normalized);
        setSettings(normalized);
        setDirty(false);
        showToast("success", "설정을 저장했습니다.");
    };

    const onReset = () => {
        clearSettingsClient();
        setSettings(defaultSettings);
        setDirty(false);
        showToast("info", "설정을 초기화했습니다.");
        setHealth({status: "idle"});
    };

    const onExport = () => {
        const blob = new Blob([JSON.stringify(settings, null, 2)], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "event-manager-settings.json";
        a.click();
        URL.revokeObjectURL(url);
        showToast("success", "설정을 JSON으로 내보냈습니다.");
    };

    const onImportClick = () => importRef.current?.click();

    const onImportFile = async (file: File | null) => {
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text) as Partial<AppSettings>;

            const merged: AppSettings = {
                ...defaultSettings,
                ...parsed,

                tenantName: String(parsed.tenantName ?? defaultSettings.tenantName),
                backendBaseUrl: normalizeUrl(String(parsed.backendBaseUrl ?? defaultSettings.backendBaseUrl)),
                googleFormUrl: String(parsed.googleFormUrl ?? "").trim(),

                notifyEmailFrom: String(parsed.notifyEmailFrom ?? defaultSettings.notifyEmailFrom).trim(),
                enableEmailNotify: Boolean(parsed.enableEmailNotify ?? defaultSettings.enableEmailNotify),
                qrTtlMinutes: Number.isFinite(Number(parsed.qrTtlMinutes))
                    ? Math.floor(Number(parsed.qrTtlMinutes))
                    : defaultSettings.qrTtlMinutes,

                timezone: String(parsed.timezone ?? defaultSettings.timezone),
                locale: parsed.locale === "en" ? "en" : "ko",

                smtpHost: String(parsed.smtpHost ?? defaultSettings.smtpHost),
                smtpPort: Number.isFinite(Number(parsed.smtpPort))
                    ? Math.floor(Number(parsed.smtpPort))
                    : defaultSettings.smtpPort,
                smtpUser: String(parsed.smtpUser ?? defaultSettings.smtpUser),
                smtpPass: String(parsed.smtpPass ?? defaultSettings.smtpPass),
                smtpUseTls: Boolean(parsed.smtpUseTls ?? defaultSettings.smtpUseTls),

                excelDuplicateKey: parsed.excelDuplicateKey === "phone" ? "phone" : "email",
                excelMode: parsed.excelMode === "replace" ? "replace" : "merge",

                checkinAllowDuplicate: Boolean(parsed.checkinAllowDuplicate ?? defaultSettings.checkinAllowDuplicate),
            };

            setSettings(merged);
            setDirty(true);
            showToast("success", "설정을 가져왔습니다. 저장을 눌러 반영하세요.");
        } catch (e: any) {
            showToast("error", `가져오기 실패: ${e?.message ?? "invalid json"}`);
        } finally {
            if (importRef.current) importRef.current.value = "";
        }
    };

    const checkHealth = async () => {
        const base = normalizeUrl(settings.backendBaseUrl);
        if (!base) {
            showToast("error", "먼저 백엔드 Base URL을 입력하세요.");
            return;
        }

        setHealth({status: "idle"});
        try {
            const url = `${base}/actuator/health`;
            const res = await fetch(url, {method: "GET"});
            const text = await res.text();

            if (!res.ok) {
                setHealth({status: "fail", detail: `HTTP ${res.status}`});
                showToast("error", `헬스체크 실패 (HTTP ${res.status})`);
                return;
            }

            let detail = text;
            try {
                const j = JSON.parse(text);
                detail = j?.status ? `status=${j.status}` : text;
            } catch {
                // ignore
            }

            setHealth({status: "ok", detail});
            showToast("success", "헬스체크 성공");
        } catch (e: any) {
            setHealth({status: "fail", detail: e?.message ?? "network error"});
            showToast("error", "헬스체크 실패 (네트워크)");
        }
    };

    const healthBadge = useMemo(() => {
        if (!settings.backendBaseUrl?.trim()) return <Badge>미설정</Badge>;
        if (health.status === "idle") return <Badge tone="blue">대기</Badge>;
        if (health.status === "ok") return <Badge tone="green">OK</Badge>;
        return <Badge tone="red">FAIL</Badge>;
    }, [health.status, settings.backendBaseUrl]);

    return (
        <main className="min-h-[calc(100vh-64px)] bg-zinc-50">
            <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
                {/* Header */}
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="text-xl font-semibold text-zinc-900">Settings</div>
                        <div className="mt-1 text-sm text-zinc-600">행사 관리 솔루션 관리자 설정</div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={requiredChecks.missing.length ? "amber" : "green"}>
                            설정 완료도 {requiredChecks.done}/{requiredChecks.total}
                        </Badge>
                        {requiredChecks.missing.length ? (
                            <Badge tone="amber">필수 미완료 {requiredChecks.missing.length}개</Badge>
                        ) : (
                            <Badge tone="green">필수 설정 완료</Badge>
                        )}
                        {dirty ? <Badge tone="blue">변경됨</Badge> : <Badge>저장됨</Badge>}
                    </div>
                </div>

                {/* Toast */}
                {toast ? (
                    <div
                        className={cx(
                            "mb-4 rounded-xl border px-4 py-3 text-sm",
                            toast.kind === "success"
                                ? "border-green-200 bg-green-50 text-green-800"
                                : toast.kind === "error"
                                    ? "border-red-200 bg-red-50 text-red-800"
                                    : "border-zinc-200 bg-white text-zinc-800"
                        )}
                    >
                        {toast.message}
                    </div>
                ) : null}

                {/* 필수 미완료 안내 */}
                {requiredChecks.missing.length ? (
                    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                        <div className="font-semibold text-amber-900">필수 설정이 아직 완료되지 않았습니다</div>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                            {requiredChecks.missing.map((m) => (
                                <li key={m}>{m}</li>
                            ))}
                        </ul>
                        <div className="mt-2 text-xs text-amber-900/80">
                            ※ 운영 전 최소 “백엔드 URL + QR TTL + (메일 알림 사용 시 이메일)”은 설정하세요.
                        </div>
                    </div>
                ) : null}

                {/* Grid layout */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    {/* Left column */}
                    <div className="space-y-6 lg:col-span-8">
                        <Card title="General"
                              description="테넌트/백엔드 연결 등 기본 설정"
                              right={<div className="flex items-center gap-2">{healthBadge}</div>}>
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                <Field label="Tenant Name" help="사이드바/상단 등에 표시될 고객(회사) 이름" required>
                                    <input
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900"
                                        value={settings.tenantName}
                                        onChange={(e) => onChange("tenantName", e.target.value)}
                                        placeholder="예: ABC Corp"/>
                                </Field>

                                <Field label="Backend Base URL"
                                       required
                                       help="예: http://localhost:8080 (끝 슬래시 자동 제거)"
                                       error={validation.errors.backendBaseUrl}>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <input
                                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900"
                                            value={settings.backendBaseUrl}
                                            onChange={(e) => onChange("backendBaseUrl", e.target.value)}
                                            placeholder="예: http://localhost:8080"/>
                                        <button
                                            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm hover:bg-zinc-50"
                                            onClick={checkHealth}
                                            type="button">
                                            헬스체크
                                        </button>
                                    </div>

                                    <div className="mt-1 text-xs text-zinc-600">
                                        상태:{" "}
                                        {health.status === "idle"
                                            ? "대기"
                                            : health.status === "ok"
                                                ? `OK (${health.detail ?? ""})`
                                                : `FAIL (${health.detail ?? ""})`}
                                    </div>
                                </Field>

                                <Field label="Timezone" help="행사 시작/마감 시간 표시 기준">
                                    <input
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900"
                                        value={settings.timezone}
                                        onChange={(e) => onChange("timezone", e.target.value)}
                                        placeholder='예: "Asia/Seoul"'/>
                                </Field>

                                <Field label="Locale" help="관리자 콘솔 기본 언어">
                                    <select
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900"
                                        value={settings.locale}
                                        onChange={(e) => onChange("locale", e.target.value as AppSettings["locale"])}>
                                        <option value="ko">ko (Korean)</option>
                                        <option value="en">en (English)</option>
                                    </select>
                                </Field>
                            </div>
                        </Card>

                        <Card title="Integrations" description="외부 서비스 연동">
                            <div className="grid grid-cols-1 gap-5">
                                <Field label="Google Form URL"
                                       help="구글폼 응답 수집/연결용. 백엔드에서 이 값을 사용하도록 설계"
                                       error={validation.errors.googleFormUrl}>
                                    <input
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900"
                                        value={settings.googleFormUrl}
                                        onChange={(e) => onChange("googleFormUrl", e.target.value)}
                                        placeholder="예: https://docs.google.com/forms/..."/>
                                </Field>
                            </div>
                        </Card>

                        <Card title="Notifications & Check-in" description="메일 알림 및 QR 인증(체크인) 정책">
                            <div className="space-y-5">
                                <div
                                    className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                                    <div>
                                        <div className="text-sm font-semibold text-zinc-900">Email Notification</div>
                                        <div className="mt-1 text-xs text-zinc-600">메일 알림 기능 사용 여부</div>
                                    </div>
                                    <Switch checked={settings.enableEmailNotify}
                                            onChange={(v) => onChange("enableEmailNotify", v)}
                                            labelLeft="OFF"
                                            labelRight="ON"/>
                                </div>

                                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                    <Field label="Email (공지 수신/발신용)"
                                           required={settings.enableEmailNotify}
                                           help="메일 알림 기능을 켠 경우 필수"
                                           error={validation.errors.notifyEmailFrom}>
                                        <input
                                            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900"
                                            value={settings.notifyEmailFrom}
                                            onChange={(e) => onChange("notifyEmailFrom", e.target.value)}
                                            placeholder="예: no-reply@your-domain.com"/>
                                    </Field>

                                    <Field label="QR TTL (minutes)"
                                           required
                                           help="QR 인증 유효시간(분). 운영 권장: 3~15분"
                                           error={validation.errors.qrTtlMinutes}>
                                        <input type="number"
                                               min={1}
                                               max={1440}
                                               className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900"
                                               value={settings.qrTtlMinutes}
                                               onChange={(e) => onChange("qrTtlMinutes", Number(e.target.value))}/>
                                    </Field>
                                </div>

                                <div
                                    className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                                    <div>
                                        <div className="text-sm font-semibold text-zinc-900">Check-in Duplicate</div>
                                        <div className="mt-1 text-xs text-zinc-600">체크인 중복 스캔 허용 여부</div>
                                    </div>
                                    <Switch checked={settings.checkinAllowDuplicate}
                                            onChange={(v) => onChange("checkinAllowDuplicate", v)}
                                            labelLeft="BLOCK"
                                            labelRight="ALLOW"/>
                                </div>
                            </div>
                        </Card>

                        <Card title="SMTP" description="메일 발송 서버 설정 (enableEmailNotify ON 시 사용)">
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                <Field label="SMTP Host" help="예: smtp.gmail.com">
                                    <input
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900"
                                        value={settings.smtpHost}
                                        onChange={(e) => onChange("smtpHost", e.target.value)}
                                        placeholder="예: smtp.example.com"
                                    />
                                </Field>

                                <Field label="SMTP Port" error={validation.errors.smtpPort}
                                       help="일반적으로 587(TLS), 465(SSL)">
                                    <input type="number"
                                           min={1}
                                           max={65535}
                                           className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900"
                                           value={settings.smtpPort}
                                           onChange={(e) => onChange("smtpPort", Number(e.target.value))}/>
                                </Field>

                                <Field label="SMTP User">
                                    <input
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900"
                                        value={settings.smtpUser}
                                        onChange={(e) => onChange("smtpUser", e.target.value)}
                                        placeholder="예: account@example.com"/>
                                </Field>

                                <Field label="SMTP Password" help="보안상 화면에 표시되므로 운영에서는 별도 관리 권장">
                                    <input
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900"
                                        type="password"
                                        value={settings.smtpPass}
                                        onChange={(e) => onChange("smtpPass", e.target.value)}
                                        placeholder="••••••••"/>
                                </Field>

                                <div className="md:col-span-2">
                                    <div
                                        className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                                        <div>
                                            <div className="text-sm font-semibold text-zinc-900">Use TLS</div>
                                            <div className="mt-1 text-xs text-zinc-600">STARTTLS/TLS 사용 여부</div>
                                        </div>
                                        <Switch checked={settings.smtpUseTls}
                                                onChange={(v) => onChange("smtpUseTls", v)}
                                                labelLeft="OFF"
                                                labelRight="ON"/>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <Card title="Excel Import" description="참여자 엑셀 업로드 처리 정책">
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                <Field label="Duplicate Key" help="중복 판별 기준">
                                    <select
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900"
                                        value={settings.excelDuplicateKey}
                                        onChange={(e) =>
                                            onChange("excelDuplicateKey", e.target.value as AppSettings["excelDuplicateKey"])
                                        }>
                                        <option value="email">email</option>
                                        <option value="phone">phone</option>
                                    </select>
                                </Field>

                                <Field label="Import Mode" help="업로드 시 데이터 반영 방식">
                                    <select
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-900"
                                        value={settings.excelMode}
                                        onChange={(e) => onChange("excelMode", e.target.value as AppSettings["excelMode"])}>
                                        <option value="merge">merge (병합)</option>
                                        <option value="replace">replace (전체 교체)</option>
                                    </select>
                                </Field>
                            </div>
                        </Card>
                    </div>

                    {/* Right column */}
                    <div className="space-y-6 lg:col-span-4">
                        <Card title="Maintenance" description="설정 백업/복원 및 초기화">
                            <div className="space-y-3">
                                <button
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm hover:bg-zinc-50"
                                    onClick={onExport}
                                    type="button">
                                    JSON 내보내기
                                </button>

                                <button
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm hover:bg-zinc-50"
                                    onClick={onImportClick}
                                    type="button">
                                    JSON 가져오기
                                </button>

                                <input ref={importRef}
                                       type="file"
                                       accept="application/json"
                                       className="hidden"
                                       onChange={(e) => onImportFile(e.target.files?.[0] ?? null)}/>

                                <div className="h-px w-full bg-zinc-100"/>

                                <button
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm hover:bg-zinc-50"
                                    onClick={onReset}
                                    type="button">
                                    초기화
                                </button>

                                <div className="text-xs text-zinc-500">* 가져오기 후에는 “저장”을 눌러야 반영됩니다.</div>
                            </div>
                        </Card>

                        <Card title="Validation" description="현재 입력값 점검">
                            {validation.ok ? (
                                <div
                                    className="flex items-center justify-between rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
                                    <div className="text-sm font-medium text-green-800">문제 없음</div>
                                    <Badge tone="green">OK</Badge>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                                    <div className="text-sm font-semibold text-amber-900">입력값을 확인하세요</div>
                                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                                        {Object.entries(validation.errors).map(([k, v]) => (
                                            <li key={k}>{v}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </Card>
                    </div>
                </div>

                {/* Sticky Action Bar */}
                <div className="sticky bottom-0 mt-8 border-t border-zinc-200 bg-zinc-50/90 backdrop-blur">
                    <div
                        className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                        <div className="text-xs text-zinc-600">
                            {dirty ? "변경사항이 있습니다. 저장을 눌러 반영하세요." : "저장된 설정이 적용 중입니다."}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button className={cx(
                                "rounded-xl px-4 py-2.5 text-sm font-semibold",
                                validation.ok && dirty ? "bg-zinc-900 text-white hover:opacity-90" : "bg-zinc-200 text-zinc-600"
                            )}
                                    onClick={onSave}
                                    disabled={!dirty || !validation.ok}
                                    type="button">
                                저장
                            </button>
                            <button
                                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm hover:bg-zinc-50"
                                onClick={onReset}
                                type="button">
                                초기화
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}