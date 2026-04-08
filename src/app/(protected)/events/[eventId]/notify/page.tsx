// src/app/(protected)/events/[eventId]/notify/page.tsx
"use client";

import React, {useEffect, useMemo, useRef, useState} from "react";
import {useParams} from "next/navigation";
import {downloadCsvFile, parseSpreadsheetPreview, type SpreadsheetUploadRow,} from "@/lib/excel-preview";
import {formatPhoneKR, isValidEmail, normalizeEmail, normalizePhoneDigits,} from "@/lib/validators";

type RecipientStatus = "draft" | "ready" | "sent" | "failed";

type Recipient = {
    id: string;
    eventId: string;
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    role?: string;
    status: RecipientStatus;
    sentAt?: string;
    createdAt: string;
};

type UploadRow = SpreadsheetUploadRow;

const TEMPLATE_HEADERS = ["이름", "이메일", "전화번호", "회사", "직함/역할"];
const DEFAULT_SUBJECT = "[행사 안내] 참가 관련 안내드립니다.";
const DEFAULT_MESSAGE = `안녕하세요.

행사 참가 관련 안내드립니다.
본 메일은 행사 운영 시스템에서 발송되는 예시 화면입니다.

감사합니다.`;

function getStorageKey(eventId: string) {
    return `event-manager:event:${eventId}:notify-recipients:v1`;
}

function uuid() {
    return `nt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalize(value: string) {
    return (value ?? "").trim().toLowerCase();
}

function formatKST(iso?: string) {
    if (!iso) return "-";

    return new Date(iso).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getStatusLabel(status: RecipientStatus) {
    if (status === "draft") return "초안";
    if (status === "ready") return "발송대기";
    if (status === "sent") return "발송완료";
    return "실패";
}

function getStatusBadgeClass(status: RecipientStatus) {
    if (status === "draft") {
        return "border-gray-200 bg-gray-50 text-gray-700";
    }
    if (status === "ready") {
        return "border-blue-200 bg-blue-50 text-blue-700";
    }
    if (status === "sent") {
        return "border-green-200 bg-green-50 text-green-700";
    }
    return "border-red-200 bg-red-50 text-red-700";
}

function makeMockRecipients(eventId: string): Recipient[] {
    const now = Date.now();
    const mk = (n: number) => new Date(now - n * 1000 * 60 * 60).toISOString();

    return [
        {
            id: uuid(),
            eventId,
            name: "홍길동",
            email: "hong@example.com",
            phone: "010-1234-5678",
            company: "BTWSoft",
            role: "매니저",
            status: "ready",
            createdAt: mk(1),
        },
        {
            id: uuid(),
            eventId,
            name: "김철수",
            email: "kim@example.com",
            phone: "010-0000-0000",
            company: "Sample Co.",
            role: "참가자",
            status: "sent",
            sentAt: mk(2),
            createdAt: mk(5),
        },
        {
            id: uuid(),
            eventId,
            name: "이영희",
            email: "",
            phone: "010-2222-3333",
            company: "Alpha Lab",
            role: "운영",
            status: "draft",
            createdAt: mk(10),
        },
    ];
}

export default function EventNotifyPage() {
    const params = useParams<{ eventId: string }>();
    const eventId = String(params?.eventId ?? "");
    const storageKey = getStorageKey(eventId);

    const inputRef = useRef<HTMLInputElement | null>(null);

    const [items, setItems] = useState<Recipient[]>([]);
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | RecipientStatus>("all");
    const [onlyValidEmail, setOnlyValidEmail] = useState(false);

    const [subject, setSubject] = useState(DEFAULT_SUBJECT);
    const [message, setMessage] = useState(DEFAULT_MESSAGE);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [company, setCompany] = useState("");
    const [role, setRole] = useState("");

    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const [info, setInfo] = useState("");
    const [warnings, setWarnings] = useState<string[]>([]);
    const [lastUploadName, setLastUploadName] = useState("");
    const [lastUploadSize, setLastUploadSize] = useState<number | null>(null);

    useEffect(() => {
        if (!eventId) return;

        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                const parsed = JSON.parse(raw) as Recipient[];
                if (Array.isArray(parsed)) {
                    setItems(parsed);
                    return;
                }
            }

            const mocks = makeMockRecipients(eventId);
            localStorage.setItem(storageKey, JSON.stringify(mocks));
            setItems(mocks);
            setInfo("알림 발송용 테스트 데이터를 자동으로 주입했습니다.");
        } catch {
            setItems(makeMockRecipients(eventId));
            setInfo("localStorage 접근이 불가하여 더미 데이터로 표시합니다.");
        }
    }, [eventId, storageKey]);

    useEffect(() => {
        if (!eventId) return;

        try {
            localStorage.setItem(storageKey, JSON.stringify(items));
        } catch {
            // noop
        }
    }, [eventId, items, storageKey]);

    const filteredItems = useMemo(() => {
        const keyword = normalize(query);

        return items.filter((item) => {
            const matchedQuery =
                !keyword ||
                [item.name, item.email, item.phone, item.company, item.role]
                    .map((value) => normalize(String(value ?? "")))
                    .some((value) => value.includes(keyword));

            const matchedStatus = statusFilter === "all" || item.status === statusFilter;
            const matchedEmail =
                !onlyValidEmail || (item.email ? isValidEmail(item.email) : false);

            return matchedQuery && matchedStatus && matchedEmail;
        });
    }, [items, onlyValidEmail, query, statusFilter]);

    const stats = useMemo(() => {
        const sent = items.filter((item) => item.status === "sent").length;
        const ready = items.filter((item) => item.status === "ready").length;
        const failed = items.filter((item) => item.status === "failed").length;
        const validEmailCount = items.filter(
            (item) => item.email && isValidEmail(item.email)
        ).length;

        return {
            total: items.length,
            sent,
            ready,
            failed,
            validEmailCount,
        };
    }, [items]);

    const lastUploadSizeText =
        lastUploadSize != null ? lastUploadSize.toLocaleString() : "0";

    const handleAdd = () => {
        setError("");
        setInfo("");

        const trimmedName = name.trim();
        const trimmedEmail = email.trim();
        const formattedPhone = formatPhoneKR(phone.trim());
        const trimmedCompany = company.trim();
        const trimmedRole = role.trim();

        if (!trimmedName) {
            setError("이름은 필수입니다.");
            return;
        }

        if (trimmedEmail && !isValidEmail(trimmedEmail)) {
            setError("이메일 형식이 올바르지 않습니다.");
            return;
        }

        const emailKey = normalizeEmail(trimmedEmail);
        const phoneKey = normalizePhoneDigits(formattedPhone);

        const duplicate = items.some((item) => {
            if (emailKey && normalizeEmail(item.email ?? "") === emailKey) return true;
            if (phoneKey && normalizePhoneDigits(item.phone ?? "") === phoneKey) return true;
            return normalize(item.name) === normalize(trimmedName);
        });

        if (duplicate) {
            setError("이미 존재하는 수신자입니다. 이름/이메일/전화번호를 확인해주세요.");
            return;
        }

        setItems((prev) => [
            {
                id: uuid(),
                eventId,
                name: trimmedName,
                email: trimmedEmail || undefined,
                phone: formattedPhone || undefined,
                company: trimmedCompany || undefined,
                role: trimmedRole || undefined,
                status: trimmedEmail && isValidEmail(trimmedEmail) ? "ready" : "draft",
                createdAt: new Date().toISOString(),
            },
            ...prev,
        ]);

        setName("");
        setEmail("");
        setPhone("");
        setCompany("");
        setRole("");
        setInfo("수신자를 추가했습니다.");
    };

    const handleDelete = (id: string) => {
        setItems((prev) => prev.filter((item) => item.id !== id));
        setInfo("수신자를 삭제했습니다.");
    };

    const handleStatusChange = (id: string, nextStatus: RecipientStatus) => {
        setItems((prev) =>
            prev.map((item) =>
                item.id === id
                    ? {
                        ...item,
                        status: nextStatus,
                        sentAt: nextStatus === "sent" ? new Date().toISOString() : undefined,
                    }
                    : item
            )
        );
        setInfo("수신자 상태를 변경했습니다.");
    };

    const handleUpload = async (file: File) => {
        setUploading(true);
        setError("");
        setInfo("");
        setWarnings([]);

        try {
            const result = await parseSpreadsheetPreview(file);

            const existingKeys = new Set(
                items.map((item) => {
                    const emailKey = normalizeEmail(item.email ?? "");
                    const phoneKey = normalizePhoneDigits(item.phone ?? "");
                    return `${normalize(item.name)}|${emailKey}|${phoneKey}`;
                })
            );

            const appended: Recipient[] = [];
            let skippedDuplicates = 0;
            let skippedInvalidEmail = 0;

            result.rows.forEach((row: UploadRow) => {
                const normalizedName = row.name.trim();
                const normalizedEmail = normalizeEmail(row.email ?? "");
                const formattedPhone = formatPhoneKR(row.phone ?? "");
                const normalizedPhone = normalizePhoneDigits(formattedPhone);

                const key = `${normalize(normalizedName)}|${normalizedEmail}|${normalizedPhone}`;

                if (existingKeys.has(key)) {
                    skippedDuplicates += 1;
                    return;
                }

                const nextStatus: RecipientStatus =
                    normalizedEmail && isValidEmail(normalizedEmail) ? "ready" : "draft";

                if (normalizedEmail && !isValidEmail(normalizedEmail)) {
                    skippedInvalidEmail += 1;
                }

                existingKeys.add(key);

                appended.push({
                    id: uuid(),
                    eventId,
                    name: normalizedName,
                    email: normalizedEmail || undefined,
                    phone: formattedPhone || undefined,
                    company: row.company?.trim() || undefined,
                    role: row.role?.trim() || undefined,
                    status: nextStatus,
                    createdAt: new Date().toISOString(),
                });
            });

            if (appended.length > 0) {
                setItems((prev) => [...appended, ...prev]);
            }

            const nextWarnings = [...result.warnings];
            if (skippedDuplicates > 0) {
                nextWarnings.push(`중복 ${skippedDuplicates}건은 제외했습니다.`);
            }
            if (skippedInvalidEmail > 0) {
                nextWarnings.push(
                    `이메일 형식이 올바르지 않은 ${skippedInvalidEmail}건은 발송대기 대신 초안 상태로 등록했습니다.`
                );
            }

            setWarnings(nextWarnings);
            setLastUploadName(file.name);
            setLastUploadSize(file.size);
            setInfo(`업로드 완료: ${appended.length.toLocaleString()}명 추가되었습니다.`);
        } catch (uploadError) {
            setError(
                uploadError instanceof Error
                    ? uploadError.message
                    : "업로드 처리 중 오류가 발생했습니다."
            );
        } finally {
            setUploading(false);
        }
    };

    const onPickFile = () => {
        inputRef.current?.click();
    };

    const onInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            await handleUpload(file);
        }
        event.target.value = "";
    };

    const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragOver(false);

        const file = event.dataTransfer.files?.[0];
        if (file) {
            await handleUpload(file);
        }
    };

    const downloadSample = () => {
        downloadCsvFile(
            TEMPLATE_HEADERS,
            [
                ["홍길동", "hong@example.com", "010-1234-5678", "BTWSoft", "매니저"],
                ["김철수", "kim@example.com", "010-0000-0000", "Sample Co.", "참가자"],
            ],
            `event-${eventId}-notify-sample.csv`
        );
    };

    const downloadCurrent = () => {
        if (!items.length) {
            setInfo("현재 데이터가 없습니다.");
            return;
        }

        downloadCsvFile(
            [...TEMPLATE_HEADERS, "상태", "발송시각"],
            items.map((item) => [
                item.name,
                item.email ?? "",
                item.phone ?? "",
                item.company ?? "",
                item.role ?? "",
                getStatusLabel(item.status),
                item.sentAt ? formatKST(item.sentAt) : "",
            ]),
            `event-${eventId}-notify-current.csv`
        );
    };

    const clearAll = () => {
        setItems([]);
        setWarnings([]);
        setLastUploadName("");
        setLastUploadSize(null);
        setError("");
        setInfo("알림 발송 대상을 초기화했습니다.");

        try {
            localStorage.removeItem(storageKey);
        } catch {
            // noop
        }
    };

    const readyRecipients = items.filter(
        (item) => item.status === "ready" && item.email && isValidEmail(item.email)
    );

    const selectedRecipients = onlyValidEmail
        ? filteredItems.filter((item) => item.email && isValidEmail(item.email))
        : filteredItems;

    const handleMockSend = async () => {
        setError("");
        setInfo("");

        if (!subject.trim()) {
            setError("메일 제목을 입력해주세요.");
            return;
        }

        if (!message.trim()) {
            setError("메일 내용을 입력해주세요.");
            return;
        }

        if (readyRecipients.length === 0) {
            setError("발송 가능한 수신자가 없습니다.");
            return;
        }

        setSending(true);

        try {
            await new Promise((resolve) => setTimeout(resolve, 600));

            const readyIds = new Set(readyRecipients.map((item) => item.id));

            setItems((prev) =>
                prev.map((item) =>
                    readyIds.has(item.id)
                        ? {
                            ...item,
                            status: "sent",
                            sentAt: new Date().toISOString(),
                        }
                        : item
                )
            );

            setInfo(
                `프론트 mock 기준으로 ${readyRecipients.length.toLocaleString()}명에게 발송 완료 처리했습니다.`
            );
        } catch {
            setError("발송 처리 중 오류가 발생했습니다.");
        } finally {
            setSending(false);
        }
    };

    return (
        <main className="p-6 text-gray-900">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-black">Notify</h1>
                    <p className="mt-1 text-sm text-gray-700">
                        이벤트 알림 발송 화면입니다. Event ID: {eventId || "-"}
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={downloadSample}
                        className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                    >
                        샘플 다운로드
                    </button>
                    <button
                        onClick={downloadCurrent}
                        className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                    >
                        현재 데이터 다운로드
                    </button>
                    <button
                        onClick={clearAll}
                        className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                    >
                        초기화
                    </button>
                </div>
            </div>

            {error ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            ) : null}

            {info ? (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
                    {info}
                </div>
            ) : null}

            {warnings.length > 0 ? (
                <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                    <div className="font-semibold">확인 필요</div>
                    <ul className="mt-2 list-disc pl-5">
                        {warnings.map((warning, index) => (
                            <li key={`${warning}-${index}`}>{warning}</li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <section className="mt-6">
                <div
                    onDragOver={(event) => {
                        event.preventDefault();
                        setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    className={[
                        "rounded-2xl border bg-white p-6 transition",
                        dragOver ? "border-black ring-2 ring-black/10" : "border-gray-200",
                    ].join(" ")}
                >
                    <div className="flex flex-col items-center gap-2 text-center">
                        <div className="text-base font-semibold text-black">
                            알림 수신자 파일 업로드
                        </div>
                        <div className="text-sm text-gray-700">
                            .xlsx / .csv 지원, 첫 줄은 헤더입니다.
                        </div>
                        <div className="text-xs text-gray-500">
                            프론트에서는 미리보기/사전검증만 수행하고, 실제 발송은 추후 백엔드에서 처리합니다.
                        </div>

                        <div className="mt-3 flex gap-2">
                            <button
                                onClick={onPickFile}
                                disabled={uploading}
                                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                                {uploading ? "업로드 처리 중..." : "파일 선택"}
                            </button>
                            <button
                                onClick={downloadSample}
                                className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                            >
                                샘플 다운로드
                            </button>
                        </div>

                        <input
                            ref={inputRef}
                            type="file"
                            accept=".xlsx,.csv"
                            className="hidden"
                            onChange={onInputChange}
                        />
                    </div>
                </div>
            </section>

            <section className="mt-6 grid gap-4 md:grid-cols-4">
                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">전체 대상 수</div>
                    <div className="mt-2 text-2xl font-semibold text-black">
                        {stats.total.toLocaleString()} 명
                    </div>
                    <div className="mt-1 text-xs text-gray-500">이벤트 기준 local mock</div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">발송 가능</div>
                    <div className="mt-2 text-2xl font-semibold text-black">
                        {stats.validEmailCount.toLocaleString()} 명
                    </div>
                    <div className="mt-1 text-xs text-gray-500">유효한 이메일 기준</div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">발송 상태</div>
                    <div className="mt-2 text-sm text-gray-800">
                        대기 {stats.ready} / 완료 {stats.sent} / 실패 {stats.failed}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">초안은 별도 확인 필요</div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">최근 업로드</div>
                    {lastUploadName ? (
                        <div className="mt-2 space-y-1 text-xs text-gray-600">
                            <div className="truncate">{lastUploadName}</div>
                            <div>{lastUploadSizeText} bytes</div>
                        </div>
                    ) : (
                        <div className="mt-2 text-xs text-gray-500">
                            아직 업로드 이력이 없습니다.
                        </div>
                    )}
                </div>
            </section>

            <section className="mt-6 rounded-2xl border bg-white p-5">
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="text-sm font-medium text-gray-700">메일 제목</label>
                        <input
                            value={subject}
                            onChange={(event) => setSubject(event.target.value)}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="메일 제목을 입력하세요"
                        />
                    </div>

                    <div className="flex items-end">
                        <div
                            className="w-full rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                            실제 SMTP/API 연동 전 단계입니다. 지금은 프론트에서 발송 가능 대상 선별과 mock 발송 상태만 처리합니다.
                        </div>
                    </div>
                </div>

                <div className="mt-4">
                    <label className="text-sm font-medium text-gray-700">메일 내용</label>
                    <textarea
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        rows={8}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        placeholder="메일 내용을 입력하세요"
                    />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        onClick={handleMockSend}
                        disabled={sending}
                        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                        {sending ? "발송 처리 중..." : "발송 실행(mock)"}
                    </button>

                    <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={onlyValidEmail}
                            onChange={(event) => setOnlyValidEmail(event.target.checked)}
                        />
                        유효한 이메일만 보기
                    </label>
                </div>
            </section>

            <section className="mt-6 rounded-2xl border bg-white p-5">
                <div className="grid gap-4 md:grid-cols-5">
                    <div>
                        <label className="text-sm font-medium text-gray-700">이름 *</label>
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="홍길동"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700">이메일</label>
                        <input
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="hong@example.com"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700">전화번호</label>
                        <input
                            value={phone}
                            onChange={(event) => setPhone(formatPhoneKR(event.target.value))}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="010-1234-5678"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700">회사</label>
                        <input
                            value={company}
                            onChange={(event) => setCompany(event.target.value)}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="BTWSoft"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700">직함/역할</label>
                        <input
                            value={role}
                            onChange={(event) => setRole(event.target.value)}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="매니저"
                        />
                    </div>
                </div>

                <div className="mt-4">
                    <button
                        onClick={handleAdd}
                        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                    >
                        수신자 추가
                    </button>
                </div>
            </section>

            <section className="mt-6 rounded-2xl border bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                    <div>
                        <h2 className="text-lg font-semibold text-black">알림 수신자 목록</h2>
                        <p className="mt-1 text-sm text-gray-600">
                            업로드/수동 등록된 알림 수신자와 발송 상태를 확인합니다.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            className="w-full min-w-[220px] max-w-xs rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="이름, 이메일, 회사 검색"
                        />
                        <select
                            value={statusFilter}
                            onChange={(event) =>
                                setStatusFilter(event.target.value as "all" | RecipientStatus)
                            }
                            className="rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        >
                            <option value="all">전체 상태</option>
                            <option value="draft">초안</option>
                            <option value="ready">발송대기</option>
                            <option value="sent">발송완료</option>
                            <option value="failed">실패</option>
                        </select>
                    </div>
                </div>

                <div className="border-b bg-gray-50/60 px-4 py-3 text-xs text-gray-600">
                    현재 필터 기준 대상: {selectedRecipients.length.toLocaleString()}명 / 즉시 발송 가능:
                    {" "}
                    {readyRecipients.length.toLocaleString()}명
                </div>

                {filteredItems.length === 0 ? (
                    <div className="p-6 text-sm text-gray-600">표시할 수신자가 없습니다.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
                            <thead className="bg-gray-50 text-gray-700">
                            <tr>
                                <th className="border-b px-4 py-3 font-semibold">이름</th>
                                <th className="border-b px-4 py-3 font-semibold">이메일</th>
                                <th className="border-b px-4 py-3 font-semibold">전화번호</th>
                                <th className="border-b px-4 py-3 font-semibold">회사</th>
                                <th className="border-b px-4 py-3 font-semibold">직함/역할</th>
                                <th className="border-b px-4 py-3 font-semibold">상태</th>
                                <th className="border-b px-4 py-3 font-semibold">발송시각</th>
                                <th className="border-b px-4 py-3 font-semibold">등록일시</th>
                                <th className="border-b px-4 py-3 font-semibold">관리</th>
                            </tr>
                            </thead>
                            <tbody>
                            {filteredItems.map((item) => (
                                <tr key={item.id} className="odd:bg-white even:bg-gray-50/50">
                                    <td className="border-b px-4 py-3 text-gray-900">{item.name}</td>
                                    <td className="border-b px-4 py-3 text-gray-900">{item.email || "-"}</td>
                                    <td className="border-b px-4 py-3 text-gray-900">{item.phone || "-"}</td>
                                    <td className="border-b px-4 py-3 text-gray-900">{item.company || "-"}</td>
                                    <td className="border-b px-4 py-3 text-gray-900">{item.role || "-"}</td>
                                    <td className="border-b px-4 py-3 text-gray-900">
                                        <div
                                            className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getStatusBadgeClass(
                                                item.status
                                            )}`}
                                        >
                                            {getStatusLabel(item.status)}
                                        </div>
                                    </td>
                                    <td className="border-b px-4 py-3 text-gray-900">
                                        {formatKST(item.sentAt)}
                                    </td>
                                    <td className="border-b px-4 py-3 text-gray-900">
                                        {formatKST(item.createdAt)}
                                    </td>
                                    <td className="border-b px-4 py-3 text-gray-900">
                                        <div className="flex flex-wrap gap-2">
                                            <select
                                                value={item.status}
                                                onChange={(event) =>
                                                    handleStatusChange(
                                                        item.id,
                                                        event.target.value as RecipientStatus
                                                    )
                                                }
                                                className="rounded-lg border bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-black/10"
                                            >
                                                <option value="draft">초안</option>
                                                <option value="ready">발송대기</option>
                                                <option value="sent">발송완료</option>
                                                <option value="failed">실패</option>
                                            </select>

                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="rounded-lg border px-3 py-1 text-xs hover:bg-gray-50"
                                            >
                                                삭제
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </main>
    );
}