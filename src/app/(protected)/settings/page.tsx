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

type Toast = { kind: "success" | "error" | "info"; message: string } | null;

function normalizeUrl(url: string) {
    const v = (url ?? "").trim();
    if (!v) return "";
    return v.replace(/\/+$/, ""); // trailing slash 제거
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<AppSettings>(defaultSettings);
    const [dirty, setDirty] = useState(false);
    const [toast, setToast] = useState<Toast>(null);
    const [health, setHealth] = useState<{ status: "idle" | "ok" | "fail"; detail?: string }>({
        status: "idle",
    });

    const importRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const loaded = loadSettingsClient();
        setSettings(loaded);
        setDirty(false);
    }, []);

    const validation = useMemo(() => {
        const errors: string[] = [];

        if (settings.notifyEmailFrom && !isValidEmail(settings.notifyEmailFrom)) {
            errors.push("알림 발신 이메일 형식이 올바르지 않습니다.");
        }
        if (settings.qrTtlMinutes < 1 || settings.qrTtlMinutes > 1440) {
            errors.push("QR 유효시간은 1~1440분 범위로 설정하세요.");
        }
        if (settings.backendBaseUrl && !/^https?:\/\//i.test(settings.backendBaseUrl.trim())) {
            errors.push("백엔드 Base URL은 http(s):// 로 시작해야 합니다.");
        }
        if (settings.googleFormUrl && !/^https?:\/\//i.test(settings.googleFormUrl.trim())) {
            errors.push("구글폼 URL은 http(s):// 로 시작해야 합니다.");
        }

        return {ok: errors.length === 0, errors};
    }, [settings]);

    const showToast = (kind: Toast["kind"], message: string) => {
        setToast({kind, message});
        window.setTimeout(() => setToast(null), 2500);
    };

    const onChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setSettings((prev) => {
            const next = {...prev, [key]: value};
            return next;
        });
        setDirty(true);
    };

    const onSave = () => {
        // 저장 전 normalize
        const normalized: AppSettings = {
            ...settings,
            backendBaseUrl: normalizeUrl(settings.backendBaseUrl),
            googleFormUrl: settings.googleFormUrl.trim(),
            tenantName: settings.tenantName.trim() || defaultSettings.tenantName,
            notifyEmailFrom: settings.notifyEmailFrom.trim(),
            qrTtlMinutes: Math.floor(settings.qrTtlMinutes),
        };

        // validate
        if (normalized.notifyEmailFrom && !isValidEmail(normalized.notifyEmailFrom)) {
            showToast("error", "알림 발신 이메일 형식이 올바르지 않습니다.");
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
                backendBaseUrl: normalizeUrl(String(parsed.backendBaseUrl ?? "")),
                googleFormUrl: String(parsed.googleFormUrl ?? "").trim(),
                tenantName: String(parsed.tenantName ?? "").trim() || defaultSettings.tenantName,
                notifyEmailFrom: String(parsed.notifyEmailFrom ?? "").trim(),
                enableEmailNotify: Boolean(parsed.enableEmailNotify ?? false),
                qrTtlMinutes: Number.isFinite(Number(parsed.qrTtlMinutes))
                    ? Math.floor(Number(parsed.qrTtlMinutes))
                    : defaultSettings.qrTtlMinutes,
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
            // Spring Boot Actuator가 있다면 /actuator/health 가 일반적
            const url = `${base}/actuator/health`;
            const res = await fetch(url, {method: "GET"});
            const text = await res.text();
            if (!res.ok) {
                setHealth({status: "fail", detail: `HTTP ${res.status}`});
                showToast("error", `헬스체크 실패 (HTTP ${res.status})`);
                return;
            }
            // 응답이 JSON이 아닐 수도 있으니 try-parse
            let detail = text;
            try {
                const j = JSON.parse(text);
                detail = j?.status ? `status=${j.status}` : text;
            } catch {
            }
            setHealth({status: "ok", detail});
            showToast("success", "헬스체크 성공");
        } catch (e: any) {
            setHealth({status: "fail", detail: e?.message ?? "network error"});
            showToast("error", "헬스체크 실패 (네트워크)");
        }
    };

    return (
        <main className="p-6 text-gray-900">
            <div className="mx-auto max-w-4xl p-6">
                <div className="mb-6">
                    <div className="text-xl font-semibold">Settings</div>
                    <div className="mt-1 text-sm text-gray-600">
                        설정 페이지입니다.
                    </div>
                </div>

                {toast ? (
                    <div className={[
                        "mb-4 rounded-lg border px-4 py-3 text-sm",
                        toast.kind === "success"
                            ? "border-green-200 bg-green-50 text-green-800"
                            : toast.kind === "error"
                                ? "border-red-200 bg-red-50 text-red-800"
                                : "border-gray-200 bg-gray-50 text-gray-800",
                    ].join(" ")}>
                        {toast.message}
                    </div>
                ) : null}

                {!validation.ok ? (
                    <div
                        className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <div className="font-medium">입력값을 확인하세요</div>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                            {validation.errors.map((e) => (
                                <li key={e}>{e}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {/* 섹션: General */}
                <section className="rounded-xl border p-5">
                    <div className="mb-4 text-base font-semibold">General</div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="text-sm font-medium text-gray-700">Tenant Name</label>
                            <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                                   value={settings.tenantName}
                                   onChange={(e) => onChange("tenantName", e.target.value)}
                                   placeholder="예: ABC Corp"/>
                            <div className="mt-1 text-xs text-gray-500">사이드바/화면 표시용 이름</div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-700">Backend Base URL</label>
                            <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                                   value={settings.backendBaseUrl}
                                   onChange={(e) => onChange("backendBaseUrl", e.target.value)}
                                   placeholder="예: http://localhost:8080"/>
                            <div className="mt-2 flex items-center gap-2">
                                <button className="rounded-lg border px-3 py-2 text-sm hover:bg-zinc-100"
                                        onClick={checkHealth}
                                        type="button">
                                    헬스체크
                                </button>
                                <div className="text-xs text-gray-600">
                                    상태:{" "}
                                    {health.status === "idle"
                                        ? "대기"
                                        : health.status === "ok"
                                            ? `OK (${health.detail ?? ""})`
                                            : `FAIL (${health.detail ?? ""})`}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 섹션: Integrations */}
                <section className="mt-6 rounded-xl border p-5">
                    <div className="mb-4 text-base font-semibold">Integrations</div>

                    <div>
                        <label className="text-sm font-medium text-gray-700">Google Form URL</label>
                        <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                               value={settings.googleFormUrl}
                               onChange={(e) => onChange("googleFormUrl", e.target.value)}
                               placeholder="예: https://docs.google.com/forms/..."/>
                        <div className="mt-1 text-xs text-gray-500">
                            구글폼 연동(응답 수집/연결)용으로 저장합니다. (백엔드 연동 시 이 값을 사용)
                        </div>
                    </div>
                </section>

                {/* 섹션: Notifications */}
                <section className="mt-6 rounded-xl border p-5">
                    <div className="mb-4 text-base font-semibold">Notifications</div>

                    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                        <div>
                            <div className="text-sm font-medium">Email Notification</div>
                            <div className="text-xs text-gray-500">메일 알림 기능 사용 여부</div>
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-2">
                            <input type="checkbox"
                                   checked={settings.enableEmailNotify}
                                   onChange={(e) => onChange("enableEmailNotify", e.target.checked)}/>
                            <span className="text-sm">{settings.enableEmailNotify ? "ON" : "OFF"}</span>
                        </label>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="text-sm font-medium text-gray-700">Email (공지 수신용 메일)</label>
                            <input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                                   value={settings.notifyEmailFrom}
                                   onChange={(e) => onChange("notifyEmailFrom", e.target.value)}
                                   placeholder="예: no-reply@your-domain.com"/>
                            <div className="mt-1 text-xs text-gray-500">
                                * 공지사항 수신 메일
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-gray-700">QR TTL (minutes)</label>
                            <input type="number"
                                   min={1}
                                   max={1440}
                                   className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                                   value={settings.qrTtlMinutes}
                                   onChange={(e) => onChange("qrTtlMinutes", Number(e.target.value))}/>
                            <div className="mt-1 text-xs text-gray-500">QR 인증 유효시간(분)</div>
                        </div>
                    </div>
                </section>

                {/* 버튼 바 */}
                <div className="mt-6 flex flex-wrap items-center gap-2">
                    <button className={[
                        "rounded-lg px-4 py-2 text-sm font-medium",
                        validation.ok
                            ? dirty
                                ? "bg-black text-white hover:opacity-90"
                                : "bg-gray-200 text-gray-600"
                            : "bg-gray-200 text-gray-600",
                    ].join(" ")}
                            onClick={onSave}
                            disabled={!dirty || !validation.ok}
                            type="button">
                        저장
                    </button>

                    <button className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-100"
                            onClick={onReset}
                            type="button">
                        초기화
                    </button>

                    <div className="mx-2 h-6 w-px bg-gray-200"/>

                    <button className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-100"
                            onClick={onExport}
                            type="button">
                        JSON 내보내기
                    </button>

                    <button className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-100"
                            onClick={onImportClick}
                            type="button">
                        JSON 가져오기
                    </button>

                    <input ref={importRef}
                           type="file"
                           accept="application/json"
                           className="hidden"
                           onChange={(e) => onImportFile(e.target.files?.[0] ?? null)}/>

                    {dirty ? <span className="text-xs text-gray-500">* 변경사항이 있습니다</span> : null}
                </div>
            </div>
        </main>
    );
}