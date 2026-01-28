"use client";

import {useMemo, useRef, useState} from "react";
import {useParams} from "next/navigation";
import * as XLSX from "xlsx";
import ParticipantPickerModal, {type Row} from "./_components/ParticipantPickerModal";

/* =========================
   상수
========================= */
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
   Notify Page
========================= */
export default function NotifyPage() {
    const {eventId} = useParams<{ eventId: string }>();

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [dragOver, setDragOver] = useState(false);

    const [fileName, setFileName] = useState("");
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<Row[]>([]);
    const [error, setError] = useState("");

    const [subject, setSubject] = useState("[Event] 행사 안내");
    const [content, setContent] = useState(
        "안녕하세요, {{name}}님.\n\n행사에 초대드립니다.\n- 행사 ID: {{eventId}}\n\n감사합니다."
    );

    // 모달 open/close만 관리
    const [pickerOpen, setPickerOpen] = useState(false);

    /* ===== 계산 ===== */
    const emailColumn = useMemo(() => {
        const candidates = ["email", "e-mail", "메일", "이메일"];
        return headers.find((h) => candidates.includes(normalizeHeader(h))) ?? "";
    }, [headers]);

    const validEmailCount = useMemo(() => {
        if (!emailColumn) return 0;
        return rows.filter((r) => isEmail(r[emailColumn] ?? "")).length;
    }, [rows, emailColumn]);

    const previewRows = rows.slice(0, MAX_PREVIEW_ROWS);

    /* ===== 핸들러 ===== */
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
            const {rows, headers} = await parseFile(file);
            setHeaders(headers);
            setRows(rows);
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

    /* ========================= Render ========================= */
    return (
        <main className="p-6 text-gray-900">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h1 className="text-2xl font-semibold text-black">Notify</h1>
                    <p className="mt-1 text-sm text-gray-700">eventId: {eventId}</p>
                </div>
            </div>

            {/* 업로드 */}
            <section className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border bg-white p-4">
                    <div onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                    }}
                         onDragLeave={() => setDragOver(false)}
                         onDrop={onDrop}
                         className={`flex min-h-[160px] flex-col items-center justify-center rounded-lg border-2 border-dashed ${
                             dragOver ? "border-black bg-gray-50" : "border-gray-300"
                         }`}>
                        <p className="font-medium">엑셀/CSV 파일 드래그 업로드</p>
                        <p className="mt-1 text-sm text-gray-600">.xlsx / .xls / .csv</p>

                        <button onClick={() => fileInputRef.current?.click()}
                                className="mt-4 rounded-lg bg-black px-4 py-2 text-sm text-white">
                            파일 선택
                        </button>

                        <button onClick={downloadSample}
                                className="mt-2 rounded-lg border px-4 py-2 text-sm hover:bg-gray-100">
                            샘플 엑셀 다운로드
                        </button>

                        <input ref={fileInputRef}
                               type="file"
                               accept={ACCEPT}
                               onChange={(e) => e.target.files && handleFile(e.target.files[0])}
                               className="hidden"/>

                        {fileName && <p className="mt-2 text-sm">업로드: {fileName}</p>}
                        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                    </div>
                </div>

                {/* 메일 폼 */}
                <div className="rounded-xl border bg-white p-4">
                    <h2 className="font-semibold">메일 템플릿</h2>

                    <label className="mt-4 block text-sm">제목</label>
                    <input value={subject}
                           onChange={(e) => setSubject(e.target.value)}
                           className="mt-1 w-full rounded border px-3 py-2 text-sm"/>

                    <label className="mt-4 block text-sm">내용</label>
                    <textarea value={content}
                              onChange={(e) => setContent(e.target.value)}
                              className="mt-1 h-40 w-full rounded border px-3 py-2 text-sm"/>

                    <button disabled={validEmailCount === 0}
                            onClick={() =>
                                alert(`발송 요청 (프로토타입)\n- eventId: ${eventId}\n- 대상: ${validEmailCount}`)
                            }
                            className={`mt-6 w-full rounded px-4 py-2 text-sm ${
                                validEmailCount === 0 ? "bg-gray-200 text-gray-500" : "bg-black text-white"
                            }`}>
                        발송 요청
                    </button>
                </div>
            </section>

            {/* 미리보기 */}
            <section className="mt-6 rounded-xl border bg-white p-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold">참여자 미리보기</h2>

                    <button onClick={() => setPickerOpen(true)}
                            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-100">
                        참여자 추가하기
                    </button>
                </div>

                {rows.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-600">데이터 없음</p>
                ) : (
                    <table className="mt-3 w-full text-sm">
                        <thead>
                        <tr>
                            {headers.map((h) => (
                                <th key={h} className="border-b px-2 py-1 text-left">
                                    {h}
                                </th>
                            ))}
                        </tr>
                        </thead>
                        <tbody>
                        {previewRows.map((r, i) => (
                            <tr key={i}>
                                {headers.map((h) => (
                                    <td key={h} className="border-b px-2 py-1">
                                        {r[h]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        </tbody>
                    </table>
                )}
            </section>

            {/* 모달 컴포넌트 */}
            <ParticipantPickerModal
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                existingRows={rows}
                onAddRows={(rowsToAdd) => {
                    if (rowsToAdd.length === 0) return;

                    const baseHeaders = ["name", "email", "company", "phone"];
                    const nextHeaders =
                        headers.length === 0 ? baseHeaders : Array.from(new Set([...headers, ...baseHeaders]));

                    setHeaders(nextHeaders);
                    setRows((prev) => [...prev, ...rowsToAdd]);
                }}
            />
        </main>
    );
}
