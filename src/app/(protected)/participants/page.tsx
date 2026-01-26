// src/app/(protected)/participants/page.tsx

"use client";

import React, {useEffect, useMemo, useRef, useState} from "react";
import * as XLSX from "xlsx";
import {postJson} from "@/lib/api";
import {formatPhoneKR, isValidEmail, normalizeEmail, normalizePhoneDigits} from "@/lib/validators";

type Person = {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    role?: string;
    createdAt: string; // ISO
};

type UploadRow = {
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    role?: string;
};

const STORAGE_KEY = "event-manager:global-participants:v1";

// 템플릿 헤더
const TEMPLATE_HEADERS = ["이름", "이메일", "전화번호", "회사", "직함/역할"];

// 업로드 엑셀 헤더 매핑
const HEADER_ALIASES: Record<string, keyof UploadRow> = {
    // ko
    이름: "name",
    이메일: "email",
    전화번호: "phone",
    휴대폰: "phone",
    회사: "company",
    소속: "company",
    직함: "role",
    역할: "role",
    "직함/역할": "role",
    // en
    name: "name",
    email: "email",
    phone: "phone",
    company: "company",
    role: "role",
    title: "role",
};

function uuid() {
    return `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalize(s: string) {
    return (s ?? "").trim().toLowerCase();
}

function sanitizeHeader(h: unknown) {
    return String(h ?? "")
        .trim()
        .replace(/\s+/g, "")
        .toLowerCase();
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

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function makeSampleWorkbook() {
    const aoa = [
        TEMPLATE_HEADERS,
        ["홍길동", "hong@example.com", "010-1234-5678", "BTWSoft", "매니저"],
        ["김철수", "kim@example.com", "010-0000-0000", "Sample Co.", "참가자"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "participants");
    return wb;
}

/** ✅ 테스트용 더미 데이터 (localStorage 비어있을 때 1회 주입용) */
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

// ✅ 엑셀/CSV → UploadRow[]
async function parseFileToRows(
    file: File
): Promise<{ rows: UploadRow[]; warnings: string[] }> {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const isCsv = ext === "csv";

    const warnings: string[] = [];

    const data = await new Promise<ArrayBuffer | string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("파일을 읽는 중 오류가 발생했습니다."));
        reader.onload = () => resolve(reader.result as any);
        if (isCsv) reader.readAsText(file);
        else reader.readAsArrayBuffer(file);
    });

    const wb = isCsv
        ? XLSX.read(data as string, {type: "string"})
        : XLSX.read(data as ArrayBuffer, {type: "array"});

    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("엑셀 시트를 찾지 못했습니다.");

    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error("엑셀 시트를 읽지 못했습니다.");

    const aoa = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        blankrows: false,
    }) as unknown[][];
    if (!aoa.length) throw new Error("엑셀에 데이터가 없습니다.");

    const rawHeaders = (aoa[0] ?? []).map((h) => String(h ?? "").trim());
    const headerMap: Array<keyof UploadRow | null> = rawHeaders.map((h) => {
        const key = HEADER_ALIASES[h] ?? HEADER_ALIASES[sanitizeHeader(h)];
        return key ?? null;
    });

    if (!headerMap.includes("name")) {
        throw new Error(
            "헤더(첫 줄)에 '이름' 컬럼이 필요합니다. 샘플 엑셀을 다운로드해서 형식을 맞춰주세요."
        );
    }

    const rows: UploadRow[] = [];

    for (let i = 1; i < aoa.length; i++) {
        const row = aoa[i] ?? [];
        const obj: UploadRow = {name: ""};

        headerMap.forEach((key, idx) => {
            if (!key) return;
            const v = row[idx];
            const text = String(v ?? "").trim();
            if (!text) return;
            (obj as any)[key] = text;
        });

        if (!obj.name) {
            warnings.push(`${i + 1}행: 이름이 비어 있어 제외했습니다.`);
            continue;
        }

        rows.push(obj);
    }

    return {rows, warnings};
}

/**
 * ✅ API 전송 스텁(미래 대비)
 * - 지금은 백엔드가 없으니 "연결만" 만들어둔다.
 * - 백엔드 구현되면 url만 맞추면 됨.
 */
async function saveParticipantsToApi(rows: UploadRow[]) {
    // TODO(백엔드): 실제 엔드포인트로 변경
    const endpoint = "/api/participants/bulk";

    // 백엔드가 아직 없으니 호출하면 404가 정상 → 그때 메시지로 안내
    const result = await postJson<{ inserted: number; updated?: number }>(endpoint, {
        items: rows,
    });

    return result;
}

export default function GlobalParticipantsPage() {
    const inputRef = useRef<HTMLInputElement | null>(null);

    const [items, setItems] = useState<Person[]>([]);
    const [q, setQ] = useState("");

    // 수동 등록 폼
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [company, setCompany] = useState("");
    const [role, setRole] = useState("");

    // 업로드 상태
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);

    // ✅ 로드: localStorage가 비어있으면 더미 데이터 1회 주입
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);

            // 저장된 게 있으면 그대로 로드
            if (raw) {
                const parsed = JSON.parse(raw) as Person[];
                if (Array.isArray(parsed)) {
                    setItems(parsed);
                    return;
                }
            }

            // 비어있으면 더미 데이터 주입
            const mocks = makeMockParticipants();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(mocks));
            setItems(mocks);
            setInfo("테스트용 더미 데이터를 자동으로 주입했습니다.");
        } catch {
            const mocks = makeMockParticipants();
            setItems(mocks);
            setInfo("localStorage 접근이 불가하여, 더미 데이터로 표시합니다.");
        }
    }, []);

    // 저장
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch {
            // ignore
        }
    }, [items]);

    const filtered = useMemo(() => {
        const keyword = normalize(q);
        if (!keyword) return items;

        return items.filter((p) => {
            const hay = `${p.name} ${p.email ?? ""} ${p.phone ?? ""} ${p.company ?? ""} ${
                p.role ?? ""
            }`.toLowerCase();
            return hay.includes(keyword);
        });
    }, [items, q]);

    const onRegister = () => {
        setError(null);
        setInfo(null);

        const n = name.trim();
        if (!n) {
            setError("이름은 필수입니다.");
            return;
        }

        const e = email.trim();
        if (e && !isValidEmail(e)) {
            setError("이메일 형식이 올바르지 않습니다.");
            return;
        }

        const eKey = e ? normalizeEmail(e) : "";
        const pKey = phone.trim() ? normalizePhoneDigits(phone) : "";

        // 중복 키 생성 시 이메일은 normalize해서 비교
        const keyNew = email.trim()
            ? `email:${normalize(email)}`
            : `name:${normalize(n)}|phone:${normalize(phone)}`;

        // email 또는 phone만 중복 기준 (이름은 제외)
        const exists = items.some((p) => {
            const oldE = p.email ? normalizeEmail(p.email) : "";
            const oldP = p.phone ? normalizePhoneDigits(p.phone) : "";
            return (eKey && oldE === eKey) || (pKey && oldP === pKey);
        });

        if (exists) {
            setError("이미 등록된 참가자입니다. (이메일 또는 이름 + 전화 기준)");
            return;
        }

        const now = new Date().toISOString();

        const newItem: Person = {
            id: uuid(),
            name: n,
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
            company: company.trim() || undefined,
            role: role.trim() || undefined,
            createdAt: now,
        };

        setItems((prev) => [newItem, ...prev]);
        setInfo("등록되었습니다.");
        setName("");
        setEmail("");
        setPhone("");
        setCompany("");
        setRole("");
    };

    const onDelete = (id: string) => setItems((prev) => prev.filter((p) => p.id !== id));

    const onResetAll = () => {
        setItems([]);
        setQ("");
        setWarnings([]);
        setError(null);
        setInfo("전체 참가자 목록을 초기화했습니다.");

        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
    };

    const onInjectMocks = () => {
        const mocks = makeMockParticipants();
        setItems(mocks);
        setQ("");
        setWarnings([]);
        setError(null);
        setInfo(`더미 데이터 ${mocks.length}건을 주입했습니다.`);

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(mocks));
        } catch {
            // ignore
        }
    };

    const downloadSample = () => {
        const wb = makeSampleWorkbook();
        const out = XLSX.write(wb, {bookType: "xlsx", type: "array"});
        downloadBlob(
            new Blob([out], {type: "application/octet-stream"}),
            "global-participants-sample.xlsx"
        );
    };

    const onPickFile = () => inputRef.current?.click();

    const handleFile = async (file: File) => {
        setError(null);
        setInfo(null);
        setWarnings([]);

        const ext = (file.name.split(".").pop() ?? "").toLowerCase();
        if (!["xlsx", "xls", "csv"].includes(ext)) {
            setError("지원하지 않는 형식입니다. .xlsx / .csv 파일만 업로드해주세요.");
            return;
        }

        setUploading(true);
        try {
            // 1) parse
            const {rows, warnings} = await parseFileToRows(file);
            setWarnings(warnings);

            if (!rows.length) {
                setInfo("업로드할 유효한 데이터가 없습니다.");
                return;
            }

            // 2) API 전송(현재는 없으므로 404가 날 수 있음)
            const apiResult = await saveParticipantsToApi(rows);

            if (!apiResult.ok) {
                // ✅ 백엔드 아직 없을 때: 로컬로 저장해서 계속 테스트 가능하도록 처리
                const now = new Date().toISOString();
                const mapped: Person[] = rows.map((r) => ({
                    id: uuid(),
                    name: r.name,
                    email: r.email,
                    phone: r.phone,
                    company: r.company,
                    role: r.role,
                    createdAt: now,
                }));

                // 중복 제거(이메일 또는 전화번호 기준) - 이름은 기준에서 제외
                const merged = [...mapped, ...items];
                const dedup: Person[] = [];

                const seenEmail = new Set<string>();
                const seenPhone = new Set<string>();

                for (const p of merged) {
                    const e = p.email ? normalizeEmail(p.email) : "";
                    const ph = p.phone ? normalizePhoneDigits(p.phone) : "";

                    // ✅ email/phone 중 하나라도 기존에 있으면 중복 처리
                    if (e && seenEmail.has(e)) continue;
                    if (ph && seenPhone.has(ph)) continue;

                    if (e) seenEmail.add(e);
                    if (ph) seenPhone.add(ph);

                    dedup.push(p);
                }

                setItems(dedup);

                setInfo(
                    `⚠️ API 미연결(status: ${apiResult.status ?? ""}) → 프로토타입용으로 localStorage에 저장했습니다. ` +
                    `(추가 ${mapped.length}명 / 현재 ${dedup.length}명)`
                );
                return;
            }

            // 3) API 성공한 경우(나중에 백엔드 생기면 이 루트로만 타게 됨)
            setInfo(`API 등록 완료: ${apiResult.data.inserted}명`);
            // 백엔드가 "저장된 최신 목록"을 리턴하면 여기서 setItems로 동기화하면 됨.
        } catch (e: any) {
            setError(e?.message ?? "업로드 처리 중 오류가 발생했습니다.");
        } finally {
            setUploading(false);
        }
    };

    const onInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await handleFile(file);
        e.target.value = "";
    };

    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) await handleFile(file);
    };

    return (
        <main className="p-6 text-gray-900">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-black">Participants</h1>
                    <p className="mt-1 text-sm text-gray-700">
                        전체 참가자(마스터) 등록/조회 (프로토타입: localStorage 저장)
                    </p>
                </div>

                <div className="flex gap-2">
                    <button onClick={onInjectMocks}
                            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">
                        더미 데이터 주입
                    </button>

                    <button onClick={downloadSample}
                            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">
                        샘플 엑셀 다운로드
                    </button>

                    <button onClick={onResetAll}
                            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">
                        전체 초기화
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
            {warnings.length ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <div className="font-semibold">주의 ({warnings.length}건)</div>
                    <ul className="mt-2 list-disc pl-5">
                        {warnings.slice(0, 10).map((w, i) => (
                            <li key={i}>{w}</li>
                        ))}
                    </ul>
                    {warnings.length > 10 ? (
                        <div className="mt-2 text-xs">… 외 {warnings.length - 10}건</div>
                    ) : null}
                </div>
            ) : null}

            {/* ✅ 엑셀 업로드 섹션 */}
            <section className="mt-6 rounded-2xl border bg-white p-5">
                <div className="flex items-end justify-between gap-3">
                    <h2 className="text-lg font-semibold text-black">엑셀 업로드 (API 등록)</h2>
                    <div className="text-xs text-gray-500">.xlsx / .csv (첫 줄 헤더 필요)</div>
                </div>

                <div onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                     onDragLeave={() => setDragOver(false)}
                     onDrop={onDrop}
                     className={[
                         "mt-4 rounded-2xl border bg-white p-6 transition",
                         dragOver ? "border-black ring-2 ring-black/10" : "border-gray-200",
                     ].join(" ")}>
                    <div className="flex flex-col items-center gap-2 text-center">
                        <div className="text-base font-semibold text-black">
                            파일을 드래그하거나 선택하세요
                        </div>
                        <div className="text-sm text-gray-700">
                            업로드 → (향후) API로 일괄 등록합니다. 현재는 API가 없어서 localStorage
                            fallback 처리됩니다.
                        </div>

                        <div className="mt-3 flex gap-2">
                            <button onClick={onPickFile}
                                    disabled={uploading}
                                    className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                                {uploading ? "업로드 중..." : "파일 선택"}
                            </button>
                            <button onClick={downloadSample}
                                    className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">
                                샘플 다운로드
                            </button>
                        </div>

                        <input ref={inputRef}
                               type="file"
                               accept=".xlsx,.xls,.csv"
                               className="hidden"
                               onChange={onInputChange}/>
                    </div>
                </div>
            </section>

            {/* 수동 등록 폼(기존) */}
            <section className="mt-6 rounded-2xl border bg-white p-5">
                <div className="flex items-end justify-between gap-3">
                    <h2 className="text-lg font-semibold text-black">참가자 등록</h2>
                    <div className="text-xs text-gray-500">* 이름 필수</div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                        <label className="text-sm font-medium text-gray-700">이름 *</label>
                        <input value={name}
                               onChange={(e) => setName(e.target.value)}
                               className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                               placeholder="홍길동"/>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700">이메일</label>
                        <input value={email}
                               onChange={(e) => setEmail(e.target.value)}
                               className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                               placeholder="hong@example.com"/>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700">전화번호</label>
                        <input value={phone}
                               onChange={(e) => setPhone(formatPhoneKR(e.target.value))}
                               className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                               placeholder="010-1234-5678"/>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700">회사</label>
                        <input value={company}
                               onChange={(e) => setCompany(e.target.value)}
                               className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                               placeholder="BTWSoft"/>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700">직함/역할</label>
                        <input value={role}
                               onChange={(e) => setRole(e.target.value)}
                               className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                               placeholder="매니저"/>
                    </div>

                    <div className="flex items-end">
                        <button onClick={onRegister}
                                className="w-full rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                            등록
                        </button>
                    </div>
                </div>
            </section>

            {/* 검색/통계 */}
            <section className="mt-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                {/* 왼쪽: 검색 */}
                <div className="w-full md:max-w-xl">
                    <label className="text-sm font-medium text-gray-700">검색</label>
                    <input value={q}
                           onChange={(e) => setQ(e.target.value)}
                           className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                           placeholder="이름 / 이메일 / 전화 / 회사 / 역할"/>
                </div>

                {/* 오른쪽: 카운트(폭 고정) */}
                <div className="flex shrink-0 justify-end gap-2 text-sm tabular-nums">
                    <span className="inline-flex w-24 justify-center rounded-full border bg-white px-3 py-1">
                      전체 {items.length}
                    </span>
                    <span className="inline-flex w-28 justify-center rounded-full border bg-white px-3 py-1">
                        검색결과 {filtered.length}
                    </span>
                </div>
            </section>

            {/* 테이블 */}
            <section className="mt-4 rounded-2xl border bg-white">
                <div className="border-b p-4">
                    <h2 className="text-lg font-semibold text-black">등록된 참가자</h2>
                    <p className="mt-1 text-sm text-gray-600">
                        TODO 프로토타입: DB 붙이면 페이징/정렬/필터 적용
                    </p>
                </div>

                {/* ✅ 항상 동일한 테이블 구조 렌더링 (빈 상태도 tbody에서 처리) */}
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-sm">
                        {/* ✅ 컬럼 폭 고정(데이터 길이로 가로폭이 흔들리는 것 방지) */}
                        <colgroup>
                            <col className="w-[140px]"/>
                            {/* 이름 */}
                            <col className="w-[240px]"/>
                            {/* 이메일 */}
                            <col className="w-[160px]"/>
                            {/* 전화번호 */}
                            <col className="w-[160px]"/>
                            {/* 회사 */}
                            <col className="w-[120px]"/>
                            {/* 역할 */}
                            <col className="w-[170px]"/>
                            {/* 등록일 */}
                            <col className="w-[90px]"/>
                            {/* 관리 */}
                        </colgroup>

                        <thead className="bg-gray-50 text-gray-700">
                        <tr>
                            <th className="border-b px-4 py-3 font-semibold">이름</th>
                            <th className="border-b px-4 py-3 font-semibold">이메일</th>
                            <th className="border-b px-4 py-3 font-semibold">전화번호</th>
                            <th className="border-b px-4 py-3 font-semibold">회사</th>
                            <th className="border-b px-4 py-3 font-semibold">역할</th>
                            <th className="border-b px-4 py-3 font-semibold">등록일</th>
                            <th className="border-b px-4 py-3 font-semibold">관리</th>
                        </tr>
                        </thead>

                        <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={7}
                                    className="px-4 py-10 text-center text-sm text-gray-600">
                                    등록된 참가자가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            filtered.slice(0, 500).map((p) => (
                                <tr key={p.id} className="odd:bg-white even:bg-gray-50/50">
                                    <td className="border-b px-4 py-3 font-medium text-gray-900 truncate">
                                        {p.name}
                                    </td>
                                    <td className="border-b px-4 py-3 text-gray-900 truncate">
                                        {p.email ?? ""}
                                    </td>
                                    <td className="border-b px-4 py-3 text-gray-900 truncate">
                                        {p.phone ?? ""}
                                    </td>
                                    <td className="border-b px-4 py-3 text-gray-900 truncate">
                                        {p.company ?? ""}
                                    </td>
                                    <td className="border-b px-4 py-3 text-gray-900 truncate">
                                        {p.role ?? ""}
                                    </td>
                                    <td className="border-b px-4 py-3 text-gray-700 truncate">
                                        {formatKST(p.createdAt)}
                                    </td>
                                    <td className="border-b px-4 py-3">
                                        <button onClick={() => onDelete(p.id)}
                                                className="w-full rounded-lg border px-3 py-1 text-xs font-medium text-gray-900 hover:bg-gray-50">
                                            삭제
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                        </tbody>
                    </table>

                    {filtered.length > 500 ? (
                        <div className="p-4 text-xs text-gray-500">최대 500건까지만 표시 중입니다.</div>
                    ) : null}
                </div>
            </section>
        </main>
    );
}
