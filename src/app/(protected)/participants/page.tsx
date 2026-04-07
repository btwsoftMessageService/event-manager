"use client";

import React, {useEffect, useMemo, useRef, useState} from "react";
import {downloadCsvFile, parseSpreadsheetPreview, type SpreadsheetUploadRow,} from "@/lib/excel-preview";
import {formatPhoneKR, isValidEmail, normalizeEmail, normalizePhoneDigits,} from "@/lib/validators";

type Person = {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    role?: string;
    createdAt: string;
};

type UploadRow = SpreadsheetUploadRow;

const STORAGE_KEY = "event-manager:global-participants:v1";
const TEMPLATE_HEADERS = ["이름", "이메일", "전화번호", "회사", "직함/역할"];

function uuid() {
    return `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalize(value: string) {
    return (value ?? "").trim().toLowerCase();
}

function formatKST(iso: string) {
    return new Date(iso).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function makeMockParticipants(): Person[] {
    const now = Date.now();
    const mk = (n: number) => new Date(now - n * 1000 * 60 * 60).toISOString();

    return [
        {
            id: uuid(),
            name: "홍길동",
            email: "hong@example.com",
            phone: "010-1234-5678",
            company: "BTWSoft",
            role: "매니저",
            createdAt: mk(1),
        },
        {
            id: uuid(),
            name: "김철수",
            email: "kim@example.com",
            phone: "010-0000-0000",
            company: "Sample Co.",
            role: "참가자",
            createdAt: mk(5),
        },
        {
            id: uuid(),
            name: "이영희",
            email: "lee@example.com",
            phone: "010-2222-3333",
            company: "Alpha Lab",
            role: "운영",
            createdAt: mk(12),
        },
        {
            id: uuid(),
            name: "박민수",
            email: "park@example.com",
            phone: "010-9999-1111",
            company: "Beta Inc.",
            role: "게스트",
            createdAt: mk(24),
        },
        {
            id: uuid(),
            name: "최지우",
            email: "choi@example.com",
            phone: "010-4444-5555",
            company: "Gamma Studio",
            role: "스태프",
            createdAt: mk(40),
        },
    ];
}

export default function GlobalParticipantsPage() {
    const inputRef = useRef<HTMLInputElement | null>(null);

    const [items, setItems] = useState<Person[]>([]);
    const [query, setQuery] = useState("");

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [company, setCompany] = useState("");
    const [role, setRole] = useState("");

    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string>("");
    const [info, setInfo] = useState<string>("");
    const [warnings, setWarnings] = useState<string[]>([]);
    const [lastUploadName, setLastUploadName] = useState("");
    const [lastUploadSize, setLastUploadSize] = useState<number | null>(null);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Person[];
                if (Array.isArray(parsed)) {
                    setItems(parsed);
                    return;
                }
            }

            const mocks = makeMockParticipants();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(mocks));
            setItems(mocks);
            setInfo("테스트용 더미 데이터를 자동으로 주입했습니다.");
        } catch {
            setItems(makeMockParticipants());
            setInfo("localStorage 접근이 불가하여 더미 데이터로 표시합니다.");
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch {
            // noop
        }
    }, [items]);

    const filteredItems = useMemo(() => {
        const keyword = normalize(query);
        if (!keyword) return items;

        return items.filter((item) =>
            [item.name, item.email, item.phone, item.company, item.role]
                .map((value) => normalize(String(value ?? "")))
                .some((value) => value.includes(keyword))
        );
    }, [items, query]);

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
            setError("이미 존재하는 참가자입니다. 이름/이메일/전화번호를 확인해주세요.");
            return;
        }

        setItems((prev) => [
            {
                id: uuid(),
                name: trimmedName,
                email: trimmedEmail || undefined,
                phone: formattedPhone || undefined,
                company: trimmedCompany || undefined,
                role: trimmedRole || undefined,
                createdAt: new Date().toISOString(),
            },
            ...prev,
        ]);

        setName("");
        setEmail("");
        setPhone("");
        setCompany("");
        setRole("");
        setInfo("참가자를 추가했습니다.");
    };

    const handleDelete = (id: string) => {
        setItems((prev) => prev.filter((item) => item.id !== id));
        setInfo("참가자를 삭제했습니다.");
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

            const appended: Person[] = [];
            let skippedDuplicates = 0;

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

                existingKeys.add(key);

                appended.push({
                    id: uuid(),
                    name: normalizedName,
                    email: normalizedEmail || undefined,
                    phone: formattedPhone || undefined,
                    company: row.company?.trim() || undefined,
                    role: row.role?.trim() || undefined,
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
            "participants-sample.csv"
        );
    };

    const downloadCurrent = () => {
        if (!items.length) {
            setInfo("현재 데이터가 없습니다.");
            return;
        }

        downloadCsvFile(
            TEMPLATE_HEADERS,
            items.map((item) => [
                item.name,
                item.email ?? "",
                item.phone ?? "",
                item.company ?? "",
                item.role ?? "",
            ]),
            "participants-current.csv"
        );
    };

    const clearAll = () => {
        setItems([]);
        setWarnings([]);
        setLastUploadName("");
        setLastUploadSize(null);
        setError("");
        setInfo("참가자 데이터를 초기화했습니다.");

        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // noop
        }
    };

    return (
        <main className="p-6 text-gray-900">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-black">Participants</h1>
                    <p className="mt-1 text-sm text-gray-700">전역 참가자 관리 화면입니다.</p>
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
                            엑셀 파일을 드래그하여 업로드
                        </div>
                        <div className="text-sm text-gray-700">
                            .xlsx / .csv 지원, 첫 줄은 헤더입니다.
                        </div>
                        <div className="text-xs text-gray-500">
                            브라우저에서는 미리보기/사전검증만 수행하고, 실제 저장은 추후 백엔드에서 처리합니다.
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
                    <div className="text-sm font-medium text-gray-700">현재 참가자 수</div>
                    <div className="mt-2 text-2xl font-semibold text-black">
                        {items.length.toLocaleString()} 명
                    </div>
                    <div className="mt-1 text-xs text-gray-500">localStorage 임시 저장</div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">필수 컬럼</div>
                    <div className="mt-2 text-sm text-gray-800">이름(필수)</div>
                    <div className="mt-1 text-xs text-gray-500">
                        이메일/전화/회사/역할은 선택
                    </div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">지원 형식</div>
                    <div className="mt-2 text-sm text-gray-800">.xlsx / .csv</div>
                    <div className="mt-1 text-xs text-gray-500">.xls는 제외했습니다.</div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">최근 업로드</div>
                    {lastUploadName ? (
                        <div className="mt-2 space-y-1 text-xs text-gray-600">
                            <div className="truncate">{lastUploadName}</div>
                            <div>{lastUploadSize != null ? lastUploadSize.toLocaleString() : "0"} bytes</div>
                        </div>
                    ) : (
                        <div className="mt-2 text-xs text-gray-500">
                            아직 업로드 이력이 없습니다.
                        </div>
                    )}
                </div>
            </section>

            <section className="mt-6 rounded-2xl border bg-white p-5">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[220px] flex-1">
                        <label className="text-sm font-medium text-gray-700">이름 *</label>
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="홍길동"
                        />
                    </div>

                    <div className="min-w-[220px] flex-1">
                        <label className="text-sm font-medium text-gray-700">이메일</label>
                        <input
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="hong@example.com"
                        />
                    </div>

                    <div className="min-w-[220px] flex-1">
                        <label className="text-sm font-medium text-gray-700">전화번호</label>
                        <input
                            value={phone}
                            onChange={(event) => setPhone(formatPhoneKR(event.target.value))}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="010-1234-5678"
                        />
                    </div>

                    <div className="min-w-[180px] flex-1">
                        <label className="text-sm font-medium text-gray-700">회사</label>
                        <input
                            value={company}
                            onChange={(event) => setCompany(event.target.value)}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="BTWSoft"
                        />
                    </div>

                    <div className="min-w-[180px] flex-1">
                        <label className="text-sm font-medium text-gray-700">직함/역할</label>
                        <input
                            value={role}
                            onChange={(event) => setRole(event.target.value)}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="매니저"
                        />
                    </div>

                    <button
                        onClick={handleAdd}
                        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                    >
                        수동 추가
                    </button>
                </div>
            </section>

            <section className="mt-6 rounded-2xl border bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                    <div>
                        <h2 className="text-lg font-semibold text-black">참가자 목록</h2>
                        <p className="mt-1 text-sm text-gray-600">
                            업로드/수동 등록된 데이터를 확인합니다.
                        </p>
                    </div>

                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="w-full max-w-xs rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        placeholder="이름, 이메일, 회사 검색"
                    />
                </div>

                {filteredItems.length === 0 ? (
                    <div className="p-6 text-sm text-gray-600">표시할 참가자가 없습니다.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-[980px] w-full border-collapse text-left text-sm">
                            <thead className="bg-gray-50 text-gray-700">
                            <tr>
                                <th className="border-b px-4 py-3 font-semibold">이름</th>
                                <th className="border-b px-4 py-3 font-semibold">이메일</th>
                                <th className="border-b px-4 py-3 font-semibold">전화번호</th>
                                <th className="border-b px-4 py-3 font-semibold">회사</th>
                                <th className="border-b px-4 py-3 font-semibold">직함/역할</th>
                                <th className="border-b px-4 py-3 font-semibold">등록일시</th>
                                <th className="border-b px-4 py-3 font-semibold">관리</th>
                            </tr>
                            </thead>
                            <tbody>
                            {filteredItems.map((item) => (
                                <tr key={item.id} className="odd:bg-white even:bg-gray-50/50">
                                    <td className="border-b px-4 py-3 text-gray-900">{item.name}</td>
                                    <td className="border-b px-4 py-3 text-gray-900">{item.email ?? "-"}</td>
                                    <td className="border-b px-4 py-3 text-gray-900">{item.phone ?? "-"}</td>
                                    <td className="border-b px-4 py-3 text-gray-900">{item.company ?? "-"}</td>
                                    <td className="border-b px-4 py-3 text-gray-900">{item.role ?? "-"}</td>
                                    <td className="border-b px-4 py-3 text-gray-900">
                                        {formatKST(item.createdAt)}
                                    </td>
                                    <td className="border-b px-4 py-3 text-gray-900">
                                        <button
                                            onClick={() => handleDelete(item.id)}
                                            className="rounded-lg border px-3 py-1 text-xs hover:bg-gray-50"
                                        >
                                            삭제
                                        </button>
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