// src/app/(protected)/events/[eventId]/participants/page.tsx
"use client";

import React, {use, useEffect, useMemo, useRef, useState} from "react";
import * as XLSX from "xlsx";

type Props = {
    params: Promise<{ eventId: string }>;
};

type Participant = {
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    role?: string;
    ticketType?: string;
    note?: string;
};

const STORAGE_KEY_PREFIX = "event-manager:participants:";

// 샘플 엑셀 컬럼(헤더) - 다운로드 템플릿
const TEMPLATE_HEADERS: Array<{ key: keyof Participant; label: string; required?: boolean }> = [
    {key: "name", label: "이름", required: true},
    {key: "email", label: "이메일"},
    {key: "phone", label: "전화번호"},
    {key: "company", label: "회사"},
    {key: "role", label: "직함/역할"},
    {key: "ticketType", label: "티켓구분"},
    {key: "note", label: "비고"},
];

// 업로드된 엑셀 헤더(한국어/영문) -> 내부 key 매핑
const HEADER_ALIASES: Record<string, keyof Participant> = {
    // ko
    "이름": "name",
    "이메일": "email",
    "전화번호": "phone",
    "휴대폰": "phone",
    "회사": "company",
    "소속": "company",
    "직함": "role",
    "역할": "role",
    "티켓": "ticketType",
    "티켓구분": "ticketType",
    "비고": "note",
    "메모": "note",
    // en
    "name": "name",
    "email": "email",
    "phone": "phone",
    "company": "company",
    "role": "role",
    "title": "role",
    "tickettype": "ticketType",
    "ticket_type": "ticketType",
    "note": "note",
};

function sanitizeHeader(h: unknown) {
    return String(h ?? "")
        .trim()
        .replace(/\s+/g, "")
        .toLowerCase();
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

function makeWorkbookFromParticipants(rows: Participant[]) {
    // 첫 행: 한국어 헤더 라벨로 구성
    const headerLabels = TEMPLATE_HEADERS.map((h) => h.label);
    const data = rows.map((r) => TEMPLATE_HEADERS.map((h) => (r[h.key] ?? "")));

    const aoa = [headerLabels, ...data];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "participants");
    return wb;
}

function makeSampleWorkbook() {
    const sampleRows: Participant[] = [
        {
            name: "홍길동",
            email: "hong@example.com",
            phone: "010-1234-5678",
            company: "BTWSoft",
            role: "매니저",
            ticketType: "일반",
            note: "샘플 데이터",
        },
        {
            name: "김철수",
            email: "kim@example.com",
            phone: "010-0000-0000",
            company: "Sample Co.",
            role: "참가자",
            ticketType: "VIP",
            note: "",
        },
    ];
    return makeWorkbookFromParticipants(sampleRows);
}

function parseFileToParticipants(file: File): Promise<{ rows: Participant[]; warnings: string[] }> {
    return new Promise((resolve, reject) => {
        const ext = (file.name.split(".").pop() ?? "").toLowerCase();
        const isCsv = ext === "csv";

        const reader = new FileReader();
        reader.onerror = () => reject(new Error("파일을 읽는 중 오류가 발생했습니다."));
        reader.onload = () => {
            try {
                const data = reader.result;
                const wb = isCsv
                    ? XLSX.read(data as string, {type: "string"})
                    : XLSX.read(data as ArrayBuffer, {type: "array"});

                const sheetName = wb.SheetNames[0];
                if (!sheetName) throw new Error("엑셀 시트를 찾지 못했습니다.");
                const ws = wb.Sheets[sheetName];
                if (!ws) throw new Error("엑셀 시트를 읽지 못했습니다.");

                // 2D 배열로 읽어서 헤더를 직접 처리 (첫 행을 헤더로)
                const aoa = XLSX.utils.sheet_to_json(ws, {header: 1, blankrows: false}) as unknown[][];
                if (!aoa.length) throw new Error("엑셀에 데이터가 없습니다.");

                const rawHeaders = (aoa[0] ?? []).map((h) => String(h ?? "").trim());
                const headerMap: Array<keyof Participant | null> = rawHeaders.map((h) => {
                    const key = HEADER_ALIASES[h] ?? HEADER_ALIASES[sanitizeHeader(h)];
                    return key ?? null;
                });

                // name(이름) 컬럼이 없으면 템플릿 기준으로 강제 안내
                const hasName = headerMap.includes("name");
                if (!hasName) {
                    throw new Error("헤더(첫 줄)에 '이름' 컬럼이 필요합니다. 샘플 엑셀을 다운로드해서 형식을 맞춰주세요.");
                }

                const warnings: string[] = [];
                const rows: Participant[] = [];

                for (let i = 1; i < aoa.length; i++) {
                    const row = aoa[i] ?? [];
                    const obj: Participant = {name: ""};

                    headerMap.forEach((key, idx) => {
                        if (!key) return;
                        const v = row[idx];
                        const text = String(v ?? "").trim();
                        if (!text) return;

                        // 간단 정리
                        if (key === "email") obj.email = text;
                        else if (key === "phone") obj.phone = text;
                        else if (key === "company") obj.company = text;
                        else if (key === "role") obj.role = text;
                        else if (key === "ticketType") obj.ticketType = text;
                        else if (key === "note") obj.note = text;
                        else if (key === "name") obj.name = text;
                    });

                    if (!obj.name) {
                        warnings.push(`${i + 1}행: 이름이 비어 있어 제외했습니다.`);
                        continue;
                    }

                    rows.push(obj);
                }

                resolve({rows, warnings});
            } catch (e) {
                reject(e);
            }
        };

        if (isCsv) reader.readAsText(file);
        else reader.readAsArrayBuffer(file);
    });
}

export default function ParticipantsPage({params}: Props) {
    const {eventId} = use(params);

    const storageKey = useMemo(() => `${STORAGE_KEY_PREFIX}${eventId}`, [eventId]);

    const inputRef = useRef<HTMLInputElement | null>(null);
    const [dragOver, setDragOver] = useState(false);

    const [rows, setRows] = useState<Participant[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    // localStorage 로드
    useEffect(() => {
        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw) as Participant[];
            if (Array.isArray(parsed)) setRows(parsed);
        } catch {
            // ignore
        }
    }, [storageKey]);

    // localStorage 저장
    useEffect(() => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(rows));
        } catch {
            // ignore
        }
    }, [rows, storageKey]);

    const onPickFile = () => inputRef.current?.click();

    const handleFile = async (file: File) => {
        setError(null);
        setInfo(null);
        setWarnings([]);

        // 기본 검증
        const ext = (file.name.split(".").pop() ?? "").toLowerCase();
        const ok = ["xlsx", "xls", "csv"].includes(ext);
        if (!ok) {
            setError("지원하지 않는 형식입니다. .xlsx / .csv 파일만 업로드해주세요.");
            return;
        }

        try {
            const {rows: parsed, warnings} = await parseFileToParticipants(file);

            // 기존 + 신규를 합치되, (이메일 있으면 이메일 기준) 중복 제거
            const merged = [...rows, ...parsed];
            const dedup: Participant[] = [];
            const seen = new Set<string>();

            for (const r of merged) {
                const key = (r.email ? `email:${r.email}` : `name:${r.name}|phone:${r.phone ?? ""}`).toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                dedup.push(r);
            }

            setRows(dedup);
            setWarnings(warnings);

            setInfo(
                `업로드 완료: ${parsed.length.toLocaleString()}명 추가 (현재 ${dedup.length.toLocaleString()}명).` +
                (warnings.length ? ` (주의 ${warnings.length}건)` : "")
            );
        } catch (e: any) {
            setError(e?.message ?? "업로드 처리 중 오류가 발생했습니다.");
        }
    };

    const onInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await handleFile(file);
        // 같은 파일 재업로드 가능하게 reset
        e.target.value = "";
    };

    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) await handleFile(file);
    };

    const downloadSample = () => {
        const wb = makeSampleWorkbook();
        const out = XLSX.write(wb, {bookType: "xlsx", type: "array"});
        downloadBlob(new Blob([out], {type: "application/octet-stream"}), "participants-sample.xlsx");
    };

    const downloadCurrent = () => {
        if (!rows.length) {
            setInfo("현재 업로드된 데이터가 없습니다.");
            return;
        }
        const wb = makeWorkbookFromParticipants(rows);
        const out = XLSX.write(wb, {bookType: "xlsx", type: "array"});
        downloadBlob(new Blob([out], {type: "application/octet-stream"}), `participants-${eventId}.xlsx`);
    };

    const clearAll = () => {
        setRows([]);
        setWarnings([]);
        setError(null);
        setInfo("초기화 완료 (프로토타입: localStorage도 비움)");
        try {
            localStorage.removeItem(storageKey);
        } catch {
            // ignore
        }
    };

    return (
        <main className="p-6 text-gray-900">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-black">Participants</h1>
                    <p className="mt-1 text-sm text-gray-700">
                        eventId: <span className="font-medium">{eventId}</span>
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button onClick={clearAll}
                            className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">
                        초기화
                    </button>
                </div>
            </div>

            {/* 안내/에러 */}
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
                        <div className="mt-2 text-xs text-amber-700">… 외 {warnings.length - 10}건</div>
                    ) : null}
                </div>
            ) : null}

            {/* 업로드 영역 */}
            <section className="mt-6">
                <div onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                     onDragLeave={() => setDragOver(false)}
                     onDrop={onDrop}
                     className={[
                         "rounded-2xl border bg-white p-6 transition",
                         dragOver ? "border-black ring-2 ring-black/10" : "border-gray-200",
                     ].join(" ")}>
                    <div className="highlight-none flex flex-col items-center gap-2 text-center">
                        <div className="text-base font-semibold text-black">엑셀 파일을 드래그하여 업로드</div>
                        <div className="text-sm text-gray-700">.xlsx / .csv 지원 (첫 번째 시트, 첫 줄은 헤더)</div>
                        <div className="text-xs text-gray-500">
                            프로토타입: 업로드 데이터는 브라우저(localStorage)에만 저장됩니다.
                        </div>

                        <div className="mt-3 flex gap-2">
                            <button onClick={onPickFile}
                                    className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                                파일 선택
                            </button>
                            <button onClick={downloadSample}
                                    className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">
                                샘플 다운로드
                            </button>
                        </div>

                        <input
                            ref={inputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            onChange={onInputChange}/>
                    </div>
                </div>
            </section>

            {/* 요약 */}
            <section className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">현재 참가자 수</div>
                    <div className="mt-2 text-2xl font-semibold text-black">{rows.length.toLocaleString()} 명</div>
                    <div className="mt-1 text-xs text-gray-500">이벤트별로 localStorage에 임시 저장</div>
                </div>
                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">필수 컬럼</div>
                    <div className="mt-2 text-sm text-gray-800">이름(필수)</div>
                    <div className="mt-1 text-xs text-gray-500">나머지는 선택</div>
                </div>
                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">다운로드</div>
                    <div className="mt-2 text-sm text-gray-800">샘플 / 업로드 데이터</div>
                    <div className="mt-1 text-xs text-gray-500">현재 화면 데이터 기준</div>
                </div>
            </section>

            {/* 테이블 미리보기 */}
            <section className="mt-6 rounded-2xl border bg-white">
                <div className="flex items-center justify-between gap-3 border-b p-4">
                    <h2 className="text-lg font-semibold text-black">업로드된 참가자 목록</h2>
                    <button onClick={downloadCurrent}
                        className="rounded-lg border bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50">
                        엑셀 다운로드
                    </button>
                </div>

                {rows.length === 0 ? (
                    <div className="p-6 text-sm text-gray-600">아직 업로드된 참가자가 없습니다.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-[900px] w-full border-collapse text-left text-sm">
                            <thead className="bg-gray-50 text-gray-700">
                            <tr>
                                {TEMPLATE_HEADERS.map((h) => (
                                    <th key={h.key} className="border-b px-4 py-3 font-semibold">
                                        {h.label}
                                        {h.required ? <span className="ml-1 text-red-500">*</span> : null}
                                    </th>
                                ))}
                            </tr>
                            </thead>
                            <tbody>
                            {rows.slice(0, 500).map((r, idx) => (
                                <tr key={idx} className="odd:bg-white even:bg-gray-50/50">
                                    {TEMPLATE_HEADERS.map((h) => (
                                        <td key={h.key} className="border-b px-4 py-3 text-gray-900">
                                            {String(r[h.key] ?? "")}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            </tbody>
                        </table>

                        {rows.length > 500 ? (
                            <div className="p-4 text-xs text-gray-500">
                                성능을 위해 500행까지만 미리보기 표시 중입니다. (다운로드에는 전체 포함)
                            </div>
                        ) : null}
                    </div>
                )}
            </section>
        </main>
    );
}
