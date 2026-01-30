// src/app/(protected)/events/[eventId]/notify/page.tsx
"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {useParams} from "next/navigation";
import * as XLSX from "xlsx";

/* =========================
   타입 & 상수
========================= */
type Row = Record<string, string>;

type Target = {
    id: string;
    name?: string;
    email: string;
    company?: string;
    phone?: string;
};

const ACCEPT =
    ".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_PREVIEW_ROWS = 10;

/* =========================
   유틸
========================= */
function normalizeHeader(h: string) {
    return h.trim().toLowerCase();
}

function isEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function normalizeEmail(v: string) {
    return v.trim().toLowerCase();
}

function uuid() {
    return `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

/* =========================
   샘플 엑셀 생성
========================= */
function buildSampleWorkbook() {
    const data = [
        {name: "홍길동", email: "hong@example.com", company: "BTWSoft", phone: "010-1234-5678"},
        {name: "김영희", email: "kim@example.com", company: "Sample Inc.", phone: "010-2222-3333"},
        {name: "이철수", email: "lee@example.com", company: "Event Corp.", phone: "010-9999-8888"},
    ];

    const ws = XLSX.utils.json_to_sheet(data, {
        header: ["name", "email", "company", "phone"],
    });

    ws["!cols"] = [{wch: 12}, {wch: 24}, {wch: 18}, {wch: 16}];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "participants");
    return wb;
}

/* =========================
   파일 파싱
========================= */
async function parseFile(file: File): Promise<{ rows: Row[]; headers: string[] }> {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, {type: "array"});
    const ws = wb.Sheets[wb.SheetNames[0]];

    const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
        defval: "",
        raw: false,
    });

    const headers = json.length > 0 ? Object.keys(json[0]) : [];
    const rows: Row[] = json.map((r) => {
        const obj: Row = {};
        for (const k of Object.keys(r)) obj[k] = String(r[k] ?? "");
        return obj;
    });

    return {rows, headers};
}

/* =========================
   (개발용) 행사 참여자 목록 불러오기 Mock
   - DB 붙기 전까지 대체
========================= */
async function loadEventParticipantsMock(eventId: string): Promise<{ rows: Row[]; headers: string[] }> {
    // 실제로는: GET /api/events/{eventId}/participants
    // 지금은 개발 단계라 mock
    await new Promise((r) => setTimeout(r, 150));

    const headers = ["name", "email", "company", "phone"];
    const rows: Row[] = [
        {name: "홍길동", email: "hong@example.com", company: "BTWSoft", phone: "010-1234-5678"},
        {name: "김영희", email: "kim@example.com", company: "Sample Inc.", phone: "010-2222-3333"},
        {name: "이철수", email: "lee@example.com", company: "Event Corp.", phone: "010-9999-8888"},
    ];

    return {rows, headers};
}

/* =========================
   Notify Page
========================= */
export default function NotifyPage() {
    const {eventId} = useParams<{ eventId: string }>();

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [dragOver, setDragOver] = useState(false);

    const [fileName, setFileName] = useState("");
    const [error, setError] = useState("");

    // 발송대상(추가한 사람들만) === 발송 대상자
    const [targets, setTargets] = useState<Target[]>([]);

    // 행사 참여자(사전 등록된 참여자) 목록
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<Row[]>([]);

    // 수동 추가 폼(개발/운영 편의)
    const [manualEmail, setManualEmail] = useState("");
    const [manualName, setManualName] = useState("");
    const [manualEmailError, setManualEmailError] = useState<string>("");

    const [template, setTemplate] = useState("invite");
    const [subject, setSubject] = useState("[Event] 행사 안내");
    const [content, setContent] = useState(
        "안녕하세요, {{name}}님.\n\n행사에 초대드립니다.\n- 행사 ID: {{eventId}}\n\n감사합니다."
    );

    /* ===== 행사 참여자 컬럼 추정 ===== */
    const emailColumn = useMemo(() => {
        const candidates = ["email", "e-mail", "메일", "이메일"];
        return headers.find((h) => candidates.includes(normalizeHeader(h))) ?? "";
    }, [headers]);

    const nameColumn = useMemo(() => {
        const candidates = ["name", "이름"];
        return headers.find((h) => candidates.includes(normalizeHeader(h))) ?? "";
    }, [headers]);

    const companyColumn = useMemo(() => {
        const candidates = ["company", "회사", "소속"];
        return headers.find((h) => candidates.includes(normalizeHeader(h))) ?? "";
    }, [headers]);

    const phoneColumn = useMemo(() => {
        const candidates = ["phone", "전화번호", "휴대폰"];
        return headers.find((h) => candidates.includes(normalizeHeader(h))) ?? "";
    }, [headers]);

    /* ===== 행사 참여자 통계 ===== */
    const validEmailRows = useMemo(() => {
        if (!emailColumn) return [];
        return rows.filter((r) => isEmail(r[emailColumn] ?? ""));
    }, [rows, emailColumn]);

    const validEmailCount = validEmailRows.length;
    const previewRows = rows.slice(0, MAX_PREVIEW_ROWS);

    /* ===== 발송대상 중복 체크 ===== */
    const targetEmailSet = useMemo(() => {
        const s = new Set<string>();
        for (const t of targets) s.add(normalizeEmail(t.email));
        return s;
    }, [targets]);

    /* =========================
       (2) 행사 참여자 목록 불러오기 (Mock)
    ========================= */
    useEffect(() => {
        (async () => {
            try {
                setError("");
                const {rows, headers} = await loadEventParticipantsMock(eventId);
                setRows(rows);
                setHeaders(headers);
            } catch {
                setError("행사 참여자 목록 불러오기에 실패했습니다.");
            }
        })();
    }, [eventId]);

    /* =========================
       공통: Target 추가 로직 (중복 방지)
    ========================= */
    const addTarget = (t: Omit<Target, "id">) => {
        const email = t.email.trim();
        if (!isEmail(email)) return;
        const eKey = normalizeEmail(email);
        if (targetEmailSet.has(eKey)) return;

        setTargets((prev) => [{id: uuid(), ...t, email}, ...prev]);
    };

    /* =========================
       (1) 업로드 → 즉시 발송 대상자에 추가
    ========================= */
    const handleFile = async (file: File) => {
        setError("");

        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ext || !["xlsx", "xls", "csv"].includes(ext)) {
            setError("지원하지 않는 파일 형식입니다.");
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            setError("파일은 2MB 이하만 업로드 가능합니다.");
            return;
        }

        try {
            setFileName(file.name);
            const {rows: uploadedRows, headers: uploadedHeaders} = await parseFile(file);

            // 업로드 파일 내 컬럼 추정 (행사 참여자 컬럼 추정과 별개)
            const upEmailCol = uploadedHeaders.find((h) => ["email", "e-mail", "메일", "이메일"].includes(normalizeHeader(h))) ?? "";
            const upNameCol = uploadedHeaders.find((h) => ["name", "이름"].includes(normalizeHeader(h))) ?? "";
            const upCompanyCol = uploadedHeaders.find((h) => ["company", "회사", "소속"].includes(normalizeHeader(h))) ?? "";
            const upPhoneCol = uploadedHeaders.find((h) => ["phone", "전화번호", "휴대폰"].includes(normalizeHeader(h))) ?? "";

            if (!upEmailCol) {
                setError("업로드 파일에서 이메일 컬럼을 찾지 못했습니다. (email/이메일/메일 헤더 필요)");
                return;
            }

            // 즉시 targets에 추가
            let added = 0;
            for (const r of uploadedRows) {
                const email = (r[upEmailCol] ?? "").trim();
                if (!isEmail(email)) continue;

                const eKey = normalizeEmail(email);
                if (targetEmailSet.has(eKey)) continue;

                addTarget({
                    email,
                    name: upNameCol ? (r[upNameCol] ?? "").trim() : "",
                    company: upCompanyCol ? (r[upCompanyCol] ?? "").trim() : "",
                    phone: upPhoneCol ? (r[upPhoneCol] ?? "").trim() : "",
                });
                added++;
            }

            setError(`업로드 완료: 발송 대상자 ${added}명 추가됨`);
        } catch {
            setError("파일 파싱에 실패했습니다.");
        }
    };

    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) await handleFile(file);
    };

    const downloadSample = () => {
        const wb = buildSampleWorkbook();
        const out = XLSX.write(wb, {bookType: "xlsx", type: "array"});
        const blob = new Blob([out], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        downloadBlob(blob, "participants_sample.xlsx");
    };

    /* =========================
       개별/수동 추가
    ========================= */
    const addTargetFromRow = (r: Row) => {
        if (!emailColumn) {
            setError("이메일 컬럼을 찾지 못했습니다. (email/이메일/메일 헤더 필요)");
            return;
        }
        const email = (r[emailColumn] ?? "").trim();
        if (!isEmail(email)) return;

        addTarget({
            email,
            name: nameColumn ? (r[nameColumn] ?? "").trim() : "",
            company: companyColumn ? (r[companyColumn] ?? "").trim() : "",
            phone: phoneColumn ? (r[phoneColumn] ?? "").trim() : "",
        });
    };

    const addManualTarget = () => {
        setError("");
        const email = manualEmail.trim();
        const name = manualName.trim();

        if (!isEmail(email)) {
            setError("수동 추가: 이메일 형식이 올바르지 않습니다.");
            return;
        }

        if (targetEmailSet.has(normalizeEmail(email))) {
            setManualEmailError("이미 발송 대상자에 추가된 이메일입니다.");
            return;
        }

        addTarget({email, name});
        setManualName("");
        setManualEmail("");
        setManualEmailError("");
    };

    const removeTarget = (id: string) => {
        setTargets((prev) => prev.filter((t) => t.id !== id));
    };

    const clearTargets = () => {
        setTargets([]);
    };

    /* =========================
       (3) 행사 참여자 전체 → 발송 대상자로 옮기기
       - "유효 이메일"만 추가
    ========================= */
    const moveAllValidParticipantsToTargets = () => {
        if (!emailColumn) {
            setError("이메일 컬럼을 찾을 수 없습니다. (email/이메일/메일 헤더 필요)");
            return;
        }
        for (const r of validEmailRows) addTargetFromRow(r);
    };

    const requestSend = () => {
        // ✅ 개발 단계: 실제 발송 대신 대상 이메일 목록만 보기
        const emails = targets.map((t) => t.email);

        alert(
            [
                `발송 요청 (개발 단계: 실제 발송 X)`,
                `- eventId: ${eventId}`,
                `- 제목: ${subject}`,
                `- 대상 수: ${emails.length}`,
                ``,
                `대상 이메일:`,
                ...emails.map((e) => `- ${e}`),
            ].join("\n")
        );
    };

    return (
        <main className="p-6 text-gray-900">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-black">Notify</h1>
                    <p className="mt-1 text-sm text-gray-700">eventId: {eventId}</p>
                </div>
                <button onClick={downloadSample} className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-100">
                    샘플 엑셀 다운로드
                </button>
            </div>

            {/* 업로드 */}
            <section className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border bg-white p-4">
                    <div
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={onDrop}
                        className={`flex min-h-[160px] flex-col items-center justify-center rounded-lg border-2 border-dashed ${
                            dragOver ? "border-black bg-gray-50" : "border-gray-300"
                        }`}
                    >
                        <p className="font-medium">엑셀/CSV 파일 드래그 업로드</p>
                        <p className="mt-1 text-sm text-gray-600">.xlsx / .xls / .csv</p>

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="mt-4 rounded-lg bg-black px-4 py-2 text-sm text-white"
                        >
                            파일 선택
                        </button>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={ACCEPT}
                            onChange={(e) => e.target.files && handleFile(e.target.files[0])}
                            className="hidden"
                        />

                        {fileName && <p className="mt-2 text-sm">업로드: {fileName}</p>}
                        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                    </div>

                    <div className="mt-4 text-sm text-gray-700">
                        ※ 업로드 시, 파일 내 유효 이메일을 즉시 “발송 대상자”에 추가합니다.
                    </div>
                </div>

                {/* 메일 폼 */}
                <div className="rounded-xl border bg-white p-4">
                    <h2 className="font-semibold">메일 템플릿</h2>

                    <label className="mt-4 block text-sm">제목</label>
                    <input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="mt-1 w-full rounded border px-3 py-2 text-sm"
                    />

                    <label className="mt-4 block text-sm">내용</label>
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="mt-1 h-40 w-full rounded border px-3 py-2 text-sm"
                    />

                    {/* ✅ 발송대상만 기준 */}
                    <button
                        disabled={targets.length === 0}
                        onClick={requestSend}
                        className={`mt-6 w-full rounded px-4 py-2 text-sm ${
                            targets.length === 0 ? "bg-gray-200 text-gray-500" : "bg-black text-white"
                        }`}
                    >
                        발송 요청
                    </button>

                    <div className="mt-3 text-xs text-gray-500">
                        개발 단계: 발송 요청 시 실제 발송 대신 “대상 이메일 목록”만 표시합니다.
                    </div>
                </div>
            </section>

            {/* 발송대상 관리 (수동 추가 유지) */}
            <section className="mt-6 rounded-xl border bg-white p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 className="font-semibold">발송 대상</h2>
                        <p className="mt-1 text-sm text-gray-600">발송대상은 아래 “발송 대상자”에서 관리합니다.</p>
                    </div>
                </div>

                {/* 수동 추가 */}
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div>
                        <label className="text-sm font-medium text-gray-700">이름(선택)</label>
                        <input
                            value={manualName}
                            onChange={(e) => setManualName(e.target.value)}
                            className="mt-1 w-full rounded border px-3 py-2 text-sm"
                            placeholder="홍길동"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-sm font-medium text-gray-700">이메일 *</label>
                        <div className="mt-1 flex gap-2">
                            <input
                                value={manualEmail}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setManualEmail(v);

                                    const trimmed = v.trim();
                                    if (trimmed.length === 0) {
                                        setManualEmailError("");
                                        return;
                                    }

                                    if (!isEmail(trimmed)) {
                                        setManualEmailError("이메일 형식이 올바르지 않습니다.");
                                        return;
                                    }

                                    if (targetEmailSet.has(normalizeEmail(trimmed))) {
                                        setManualEmailError("이미 발송 대상자에 추가된 이메일입니다.");
                                        return;
                                    }

                                    setManualEmailError("");
                                }}
                                className={`w-full rounded border px-3 py-2 text-sm ${
                                    manualEmailError ? "border-red-500" : ""
                                }`}
                                placeholder="hong@example.com"
                            />

                            {manualEmailError && (
                                <p className="mt-1 text-xs text-red-600">{manualEmailError}</p>
                            )}

                            <button
                                onClick={addManualTarget}
                                disabled={manualEmail.trim().length === 0 || manualEmailError.length > 0}
                                className={`shrink-0 rounded-lg px-4 py-2 text-sm text-white ${
                                    manualEmail.trim().length === 0 || manualEmailError.length > 0
                                        ? "bg-gray-200 text-gray-500"
                                        : "bg-black"
                                }`}
                            >
                                추가
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* 발송 대상자(=targets) */}
            <section className="mt-6 rounded-xl border bg-white p-4">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h2 className="font-semibold">발송 대상자</h2>
                        <p className="mt-1 text-sm text-gray-600">여기 목록이 곧 발송 대상자입니다. 제거하면 발송 대상에서도 제외됩니다.</p>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                        <span className="rounded-full border bg-white px-3 py-1">총 {targets.length}명</span>
                        <button
                            onClick={clearTargets}
                            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                            disabled={targets.length === 0}
                        >
                            전체 비우기
                        </button>
                    </div>
                </div>

                {targets.length === 0 ? (
                    <p className="mt-4 text-sm text-gray-600">발송 대상자가 없습니다. 행사 참여자에서 옮기거나 업로드/수동추가로 넣어주세요.</p>
                ) : (
                    <div className="mt-4 overflow-x-auto rounded-lg border">
                        <table className="min-w-[720px] w-full text-sm">
                            <thead className="bg-gray-50">
                            <tr>
                                <th className="border-b px-3 py-2 text-left font-semibold">이름</th>
                                <th className="border-b px-3 py-2 text-left font-semibold">이메일</th>
                                <th className="border-b px-3 py-2 text-left font-semibold">회사</th>
                                <th className="border-b px-3 py-2 text-left font-semibold">전화</th>
                                <th className="border-b px-3 py-2 text-left font-semibold">관리</th>
                            </tr>
                            </thead>
                            <tbody>
                            {targets.map((t) => (
                                <tr key={t.id} className="odd:bg-white even:bg-gray-50">
                                    <td className="border-b px-3 py-2">{t.name ?? ""}</td>
                                    <td className="border-b px-3 py-2">{t.email}</td>
                                    <td className="border-b px-3 py-2">{t.company ?? ""}</td>
                                    <td className="border-b px-3 py-2">{t.phone ?? ""}</td>
                                    <td className="border-b px-3 py-2">
                                        <button
                                            onClick={() => removeTarget(t.id)}
                                            className="rounded-lg border px-3 py-1 text-xs hover:bg-gray-50"
                                        >
                                            제거
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* 행사 참여자 (사전 등록된 참여자) */}
            <section className="mt-6 rounded-xl border bg-white p-4">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h2 className="font-semibold">행사 참여자</h2>
                        <p className="mt-1 text-sm text-gray-600">사전에 등록된 참여자 목록입니다. (개발 단계: mock 로딩)</p>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                        <span className="rounded-full border bg-white px-3 py-1">원본 {rows.length}행</span>
                        <span className="rounded-full border bg-white px-3 py-1">유효 이메일 {validEmailCount}개</span>

                        {/* (3) 전체 옮기기 */}
                        <button
                            onClick={moveAllValidParticipantsToTargets}
                            className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:bg-gray-200 disabled:text-gray-500"
                            disabled={validEmailCount === 0}
                            title="유효 이메일만 발송 대상자에 추가"
                        >
                            유효 이메일 전체 발송대상으로 옮기기
                        </button>
                    </div>
                </div>

                {rows.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-600">데이터 없음</p>
                ) : (
                    <>
                        {!emailColumn ? (
                            <p className="mt-3 text-sm text-red-600">이메일 컬럼을 찾을 수 없습니다. (email/이메일/메일 헤더 필요)</p>
                        ) : null}

                        <table className="mt-3 w-full text-sm">
                            <thead>
                            <tr>
                                <th className="border-b px-2 py-1 text-left w-[110px]">추가</th>
                                {headers.map((h) => (
                                    <th key={h} className="border-b px-2 py-1 text-left">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                            </thead>
                            <tbody>
                            {previewRows.map((r, i) => {
                                const email = emailColumn ? (r[emailColumn] ?? "") : "";
                                const ok = emailColumn ? isEmail(email) : false;
                                const already = ok ? targetEmailSet.has(normalizeEmail(email)) : false;

                                return (
                                    <tr key={i} className="odd:bg-white even:bg-gray-50">
                                        <td className="border-b px-2 py-1">
                                            <button
                                                disabled={!ok || already}
                                                onClick={() => addTargetFromRow(r)}
                                                className={`rounded-lg px-3 py-1 text-xs ${
                                                    !ok || already ? "bg-gray-200 text-gray-500" : "bg-black text-white"
                                                }`}
                                                title={!ok ? "유효한 이메일이 필요합니다." : already ? "이미 발송대상에 포함됨" : "발송대상에 추가"}
                                            >
                                                {already ? "추가됨" : "추가"}
                                            </button>
                                        </td>

                                        {headers.map((h) => (
                                            <td key={h} className="border-b px-2 py-1">
                                                {r[h]}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>

                        {rows.length > MAX_PREVIEW_ROWS ? (
                            <div className="mt-2 text-xs text-gray-500">
                                미리보기는 최대 {MAX_PREVIEW_ROWS}행까지만 표시됩니다.
                            </div>
                        ) : null}
                    </>
                )}
            </section>
        </main>
    );
}
