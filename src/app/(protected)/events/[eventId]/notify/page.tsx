"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {useParams} from "next/navigation";
import ExcelJS from "exceljs";

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

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_PREVIEW_ROWS = 10;

function normalizeHeader(value: string): string {
    return value.trim().toLowerCase();
}

function isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
}

function uuid(): string {
    return `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === "," && !inQuotes) {
            result.push(current.trim());
            current = "";
            continue;
        }

        current += char;
    }

    result.push(current.trim());
    return result;
}

function parseCsvText(text: string): string[][] {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    return normalized
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => parseCsvLine(line));
}

async function buildSampleWorkbookBlob(): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("participants");

    worksheet.addRow(["name", "email", "company", "phone"]);
    worksheet.addRow(["홍길동", "hong@example.com", "BTWSoft", "010-1234-5678"]);
    worksheet.addRow(["김영희", "kim@example.com", "Sample Inc.", "010-2222-3333"]);
    worksheet.addRow(["이철수", "lee@example.com", "Event Corp.", "010-9999-8888"]);

    worksheet.columns = [
        {width: 16},
        {width: 30},
        {width: 22},
        {width: 18},
    ];

    const buffer = await workbook.xlsx.writeBuffer();

    return new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
}

async function parseFile(
    file: File
): Promise<{ rows: Row[]; headers: string[] }> {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const isCsv = ext === "csv";

    let matrix: string[][] = [];

    if (isCsv) {
        const text = await file.text();
        matrix = parseCsvText(text);
    } else {
        const buffer = await file.arrayBuffer();
        const workbook = new Workbook();
        await workbook.xlsx.load(buffer);

        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
            return {rows: [], headers: []};
        }

        worksheet.eachRow((row) => {
            const rawValues = Array.isArray(row.values) ? row.values.slice(1) : [];
            const values = rawValues.map((value) => String(value ?? "").trim());
            matrix.push(values);
        });
    }

    if (matrix.length === 0) {
        return {rows: [], headers: []};
    }

    const headers = (matrix[0] ?? []).map((header) => String(header ?? "").trim());

    const rows: Row[] = matrix.slice(1).map((line) => {
        const obj: Row = {};
        headers.forEach((header, index) => {
            obj[header] = String(line[index] ?? "").trim();
        });
        return obj;
    });

    return {rows, headers};
}

type ParticipantMockRow = {
    name: string;
    email: string;
    company: string;
    phone: string;
};

async function loadEventParticipantsMock(
    _eventId: string
): Promise<{ rows: Row[]; headers: string[] }> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 150);
    });

    const headers = ["name", "email", "company", "phone"];

    const rows: ParticipantMockRow[] = [
        {
            name: "홍길동",
            email: "hong@example.com",
            company: "BTWSoft",
            phone: "010-1234-5678",
        },
        {
            name: "김영희",
            email: "kim@example.com",
            company: "Sample Inc.",
            phone: "010-2222-3333",
        },
        {
            name: "이철수",
            email: "lee@example.com",
            company: "Event Corp.",
            phone: "010-9999-8888",
        },
    ];

    return {rows, headers};
}

export default function NotifyPage() {
    const params = useParams();
    const eventIdParam = params?.eventId;
    const eventId =
        typeof eventIdParam === "string"
            ? eventIdParam
            : Array.isArray(eventIdParam)
                ? (eventIdParam[0] ?? "")
                : "";

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [dragOver, setDragOver] = useState(false);
    const [fileName, setFileName] = useState("");

    const [error, setError] = useState("");
    const [info, setInfo] = useState("");

    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<Row[]>([]);
    const [targets, setTargets] = useState<Target[]>([]);

    const [manualName, setManualName] = useState("");
    const [manualEmail, setManualEmail] = useState("");
    const [manualEmailError, setManualEmailError] = useState("");

    const [subject, setSubject] = useState("[Event] 행사 안내");
    const [content, setContent] = useState(
        "안녕하세요, {{name}}님.\n\n행사에 초대드립니다.\n- 행사 ID: {{eventId}}\n\n감사합니다."
    );

    const emailColumn = useMemo(() => {
        const candidates = ["email", "e-mail", "이메일", "메일"];
        return headers.find((header) => candidates.includes(normalizeHeader(header))) ?? "";
    }, [headers]);

    const nameColumn = useMemo(() => {
        const candidates = ["name", "이름"];
        return headers.find((header) => candidates.includes(normalizeHeader(header))) ?? "";
    }, [headers]);

    const companyColumn = useMemo(() => {
        const candidates = ["company", "회사", "소속"];
        return headers.find((header) => candidates.includes(normalizeHeader(header))) ?? "";
    }, [headers]);

    const phoneColumn = useMemo(() => {
        const candidates = ["phone", "전화번호", "휴대폰"];
        return headers.find((header) => candidates.includes(normalizeHeader(header))) ?? "";
    }, [headers]);

    const validEmailRows = useMemo(() => {
        if (!emailColumn) return [];
        return rows.filter((row) => isEmail(row[emailColumn] ?? ""));
    }, [rows, emailColumn]);

    const targetEmailSet = useMemo(() => {
        const set = new Set<string>();
        targets.forEach((target) => {
            set.add(normalizeEmail(target.email));
        });
        return set;
    }, [targets]);

    const previewRows = useMemo(() => {
        return rows.slice(0, MAX_PREVIEW_ROWS);
    }, [rows]);

    useEffect(() => {
        let mounted = true;

        const run = async () => {
            try {
                setError("");
                setInfo("");

                const result = await loadEventParticipantsMock(eventId);

                if (!mounted) return;

                setHeaders(result.headers);
                setRows(result.rows);
            } catch {
                if (!mounted) return;
                setError("행사 참여자 목록 불러오기에 실패했습니다.");
            }
        };

        void run();

        return () => {
            mounted = false;
        };
    }, [eventId]);

    const addTarget = (target: Omit<Target, "id">) => {
        const email = target.email.trim();

        if (!isEmail(email)) return;
        if (targetEmailSet.has(normalizeEmail(email))) return;

        setTargets((prev) => [
            {
                id: uuid(),
                email,
                name: target.name?.trim() || "",
                company: target.company?.trim() || "",
                phone: target.phone?.trim() || "",
            },
            ...prev,
        ]);
    };

    const handleFile = async (file: File) => {
        setError("");
        setInfo("");

        const ext = (file.name.split(".").pop() ?? "").toLowerCase();

        if (!["xlsx", "xls", "csv"].includes(ext)) {
            setError("지원하지 않는 파일 형식입니다. (.xlsx / .xls / .csv)");
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            setError("파일은 2MB 이하만 업로드 가능합니다.");
            return;
        }

        try {
            setFileName(file.name);

            const parsed = await parseFile(file);
            const uploadedHeaders = parsed.headers;
            const uploadedRows = parsed.rows;

            const uploadedEmailColumn =
                uploadedHeaders.find((header) =>
                    ["email", "e-mail", "이메일", "메일"].includes(normalizeHeader(header))
                ) ?? "";

            const uploadedNameColumn =
                uploadedHeaders.find((header) =>
                    ["name", "이름"].includes(normalizeHeader(header))
                ) ?? "";

            const uploadedCompanyColumn =
                uploadedHeaders.find((header) =>
                    ["company", "회사", "소속"].includes(normalizeHeader(header))
                ) ?? "";

            const uploadedPhoneColumn =
                uploadedHeaders.find((header) =>
                    ["phone", "전화번호", "휴대폰"].includes(normalizeHeader(header))
                ) ?? "";

            if (!uploadedEmailColumn) {
                setError("업로드 파일에서 이메일 컬럼을 찾지 못했습니다. (email/이메일/메일 필요)");
                return;
            }

            const existingEmails = new Set<string>(Array.from(targetEmailSet));
            const nextTargets: Target[] = [];

            uploadedRows.forEach((row) => {
                const email = (row[uploadedEmailColumn] ?? "").trim();
                if (!isEmail(email)) return;

                const emailKey = normalizeEmail(email);
                if (existingEmails.has(emailKey)) return;

                existingEmails.add(emailKey);

                nextTargets.push({
                    id: uuid(),
                    email,
                    name: uploadedNameColumn ? (row[uploadedNameColumn] ?? "").trim() : "",
                    company: uploadedCompanyColumn ? (row[uploadedCompanyColumn] ?? "").trim() : "",
                    phone: uploadedPhoneColumn ? (row[uploadedPhoneColumn] ?? "").trim() : "",
                });
            });

            if (nextTargets.length > 0) {
                setTargets((prev) => [...nextTargets, ...prev]);
            }

            setInfo(`업로드 완료: 발송 대상자 ${nextTargets.length}명 추가됨`);
        } catch {
            setError("파일 파싱에 실패했습니다.");
        }
    };

    const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragOver(false);

        const file = event.dataTransfer.files?.[0];
        if (file) {
            await handleFile(file);
        }
    };

    const onInputFileChange = async (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = event.target.files?.[0];
        if (file) {
            await handleFile(file);
        }
        event.target.value = "";
    };

    const downloadSample = async () => {
        setError("");
        setInfo("");

        try {
            const blob = await buildSampleWorkbookBlob();
            downloadBlob(blob, "participants_sample.xlsx");
        } catch {
            setError("샘플 파일 생성에 실패했습니다.");
        }
    };

    const addTargetFromRow = (row: Row) => {
        if (!emailColumn) {
            setError("이메일 컬럼을 찾지 못했습니다. (email/이메일/메일 필요)");
            return;
        }

        const email = (row[emailColumn] ?? "").trim();
        if (!isEmail(email)) return;

        addTarget({
            email,
            name: nameColumn ? (row[nameColumn] ?? "").trim() : "",
            company: companyColumn ? (row[companyColumn] ?? "").trim() : "",
            phone: phoneColumn ? (row[phoneColumn] ?? "").trim() : "",
        });
    };

    const moveAllValidParticipantsToTargets = () => {
        if (!emailColumn) {
            setError("이메일 컬럼을 찾을 수 없습니다. (email/이메일/메일 필요)");
            return;
        }

        const existingEmails = new Set<string>(Array.from(targetEmailSet));
        const nextTargets: Target[] = [];

        validEmailRows.forEach((row) => {
            const email = (row[emailColumn] ?? "").trim();
            if (!isEmail(email)) return;

            const emailKey = normalizeEmail(email);
            if (existingEmails.has(emailKey)) return;

            existingEmails.add(emailKey);

            nextTargets.push({
                id: uuid(),
                email,
                name: nameColumn ? (row[nameColumn] ?? "").trim() : "",
                company: companyColumn ? (row[companyColumn] ?? "").trim() : "",
                phone: phoneColumn ? (row[phoneColumn] ?? "").trim() : "",
            });
        });

        if (nextTargets.length > 0) {
            setTargets((prev) => [...nextTargets, ...prev]);
        }

        setInfo(`유효 이메일 ${nextTargets.length}건을 발송 대상자에 추가했습니다.`);
    };

    const addManualTarget = () => {
        setError("");
        setInfo("");

        const email = manualEmail.trim();
        const name = manualName.trim();

        if (!isEmail(email)) {
            setManualEmailError("이메일 형식이 올바르지 않습니다.");
            return;
        }

        if (targetEmailSet.has(normalizeEmail(email))) {
            setManualEmailError("이미 발송 대상자에 추가된 이메일입니다.");
            return;
        }

        setTargets((prev) => [
            {
                id: uuid(),
                email,
                name,
                company: "",
                phone: "",
            },
            ...prev,
        ]);

        setManualName("");
        setManualEmail("");
        setManualEmailError("");
        setInfo("수동 발송 대상자가 추가되었습니다.");
    };

    const removeTarget = (id: string) => {
        setTargets((prev) => prev.filter((target) => target.id !== id));
    };

    const clearTargets = () => {
        setTargets([]);
        setInfo("발송 대상자를 모두 비웠습니다.");
    };

    const requestSend = () => {
        const emails = targets.map((target) => target.email);

        alert(
            [
                "발송 요청 (개발 단계: 실제 발송 X)",
                `- eventId: ${eventId}`,
                `- 제목: ${subject}`,
                `- 대상 수: ${emails.length}`,
                "",
                "대상 이메일:",
                ...emails.map((email) => `- ${email}`),
                "",
                "본문:",
                content,
            ].join("\n")
        );
    };

    return (
        <main className="p-6 text-gray-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-black">Notify</h1>
                    <p className="mt-1 text-sm text-gray-700">eventId: {eventId || "-"}</p>
                </div>

                <button
                    onClick={downloadSample}
                    className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                    샘플 엑셀 다운로드
                </button>
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

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border bg-white p-5">
                    <h2 className="text-lg font-semibold text-black">파일 업로드</h2>
                    <p className="mt-1 text-sm text-gray-600">
                        엑셀/CSV 업로드 시 유효 이메일을 발송 대상자에 바로 추가합니다.
                    </p>

                    <div
                        onDragOver={(event) => {
                            event.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={onDrop}
                        className={[
                            "mt-4 flex min-h-[180px] flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition",
                            dragOver ? "border-black bg-gray-50" : "border-gray-300 bg-white",
                        ].join(" ")}
                    >
                        <p className="text-base font-semibold text-black">엑셀/CSV 파일 드래그 업로드</p>
                        <p className="mt-1 text-sm text-gray-600">.xlsx / .xls / .csv, 최대 2MB</p>

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                        >
                            파일 선택
                        </button>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={ACCEPT}
                            className="hidden"
                            onChange={onInputFileChange}
                        />

                        {fileName ? (
                            <p className="mt-3 text-sm text-gray-700">업로드 파일: {fileName}</p>
                        ) : null}
                    </div>
                </div>

                <div className="rounded-2xl border bg-white p-5">
                    <h2 className="text-lg font-semibold text-black">메일 템플릿</h2>

                    <label className="mt-4 block text-sm font-medium text-gray-700">제목</label>
                    <input
                        value={subject}
                        onChange={(event) => setSubject(event.target.value)}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                    />

                    <label className="mt-4 block text-sm font-medium text-gray-700">내용</label>
                    <textarea
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        className="mt-1 h-44 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                    />

                    <button
                        disabled={targets.length === 0}
                        onClick={requestSend}
                        className={`mt-6 w-full rounded-lg px-4 py-2 text-sm font-medium ${
                            targets.length === 0 ? "bg-gray-200 text-gray-500" : "bg-black text-white"
                        }`}
                    >
                        발송 요청
                    </button>

                    <div className="mt-3 text-xs text-gray-500">
                        개발 단계에서는 실제 발송 대신 대상 이메일 목록만 표시합니다.
                    </div>
                </div>
            </section>

            <section className="mt-6 rounded-2xl border bg-white p-5">
                <div>
                    <h2 className="text-lg font-semibold text-black">수동 발송 대상 추가</h2>
                    <p className="mt-1 text-sm text-gray-600">
                        이메일을 직접 입력해서 발송 대상자에 추가합니다.
                    </p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div>
                        <label className="text-sm font-medium text-gray-700">이름(선택)</label>
                        <input
                            value={manualName}
                            onChange={(event) => setManualName(event.target.value)}
                            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            placeholder="홍길동"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="text-sm font-medium text-gray-700">이메일 *</label>

                        <div className="mt-1 flex flex-col gap-2 md:flex-row">
                            <div className="flex-1">
                                <input
                                    value={manualEmail}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        setManualEmail(value);

                                        const trimmed = value.trim();

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
                                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 ${
                                        manualEmailError ? "border-red-500" : ""
                                    }`}
                                    placeholder="hong@example.com"
                                />

                                {manualEmailError ? (
                                    <p className="mt-1 text-xs text-red-600">{manualEmailError}</p>
                                ) : null}
                            </div>

                            <button
                                onClick={addManualTarget}
                                disabled={manualEmail.trim().length === 0 || manualEmailError.length > 0}
                                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${
                                    manualEmail.trim().length === 0 || manualEmailError.length > 0
                                        ? "bg-gray-200 text-gray-500"
                                        : "bg-black text-white"
                                }`}
                            >
                                추가
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mt-6 rounded-2xl border bg-white p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-black">발송 대상자</h2>
                        <p className="mt-1 text-sm text-gray-600">
                            업로드, 행사 참여자 추가, 수동 입력으로 모은 최종 발송 목록입니다.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                        <span className="rounded-full border bg-white px-3 py-1">총 {targets.length}명</span>
                        <button
                            onClick={clearTargets}
                            disabled={targets.length === 0}
                            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                        >
                            전체 비우기
                        </button>
                    </div>
                </div>

                {targets.length === 0 ? (
                    <p className="mt-4 text-sm text-gray-600">발송 대상자가 없습니다.</p>
                ) : (
                    <div className="mt-4 overflow-x-auto rounded-xl border">
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
                            {targets.map((target) => (
                                <tr key={target.id} className="odd:bg-white even:bg-gray-50">
                                    <td className="border-b px-3 py-2">{target.name ?? ""}</td>
                                    <td className="border-b px-3 py-2">{target.email}</td>
                                    <td className="border-b px-3 py-2">{target.company ?? ""}</td>
                                    <td className="border-b px-3 py-2">{target.phone ?? ""}</td>
                                    <td className="border-b px-3 py-2">
                                        <button
                                            onClick={() => removeTarget(target.id)}
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

            <section className="mt-6 rounded-2xl border bg-white p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-black">행사 참여자</h2>
                        <p className="mt-1 text-sm text-gray-600">
                            현재는 mock 데이터입니다. 이후 실제 API 연동으로 교체하면 됩니다.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full border bg-white px-3 py-1">
              원본 {rows.length}행
            </span>
                        <span className="rounded-full border bg-white px-3 py-1">
              유효 이메일 {validEmailRows.length}개
            </span>

                        <button
                            onClick={moveAllValidParticipantsToTargets}
                            disabled={validEmailRows.length === 0}
                            className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:bg-gray-200 disabled:text-gray-500"
                        >
                            유효 이메일 전체 추가
                        </button>
                    </div>
                </div>

                {!emailColumn ? (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        이메일 컬럼을 찾지 못했습니다. 헤더에 email / 이메일 / 메일 중 하나가 필요합니다.
                    </div>
                ) : null}

                {rows.length === 0 ? (
                    <p className="mt-4 text-sm text-gray-600">데이터가 없습니다.</p>
                ) : (
                    <>
                        <div className="mt-4 overflow-x-auto rounded-xl border">
                            <table className="min-w-[760px] w-full text-sm">
                                <thead className="bg-gray-50">
                                <tr>
                                    <th className="w-[110px] border-b px-2 py-2 text-left font-semibold">
                                        추가
                                    </th>
                                    {headers.map((header) => (
                                        <th
                                            key={header}
                                            className="border-b px-2 py-2 text-left font-semibold"
                                        >
                                            {header}
                                        </th>
                                    ))}
                                </tr>
                                </thead>
                                <tbody>
                                {previewRows.map((row, index) => {
                                    const email = emailColumn ? row[emailColumn] ?? "" : "";
                                    const canAdd = emailColumn ? isEmail(email) : false;
                                    const alreadyAdded = canAdd
                                        ? targetEmailSet.has(normalizeEmail(email))
                                        : false;

                                    return (
                                        <tr key={`${index}-${email}`} className="odd:bg-white even:bg-gray-50">
                                            <td className="border-b px-2 py-2">
                                                <button
                                                    onClick={() => addTargetFromRow(row)}
                                                    disabled={!canAdd || alreadyAdded}
                                                    className={`rounded-lg px-3 py-1 text-xs font-medium ${
                                                        !canAdd || alreadyAdded
                                                            ? "bg-gray-200 text-gray-500"
                                                            : "bg-black text-white"
                                                    }`}
                                                >
                                                    {alreadyAdded ? "추가됨" : "추가"}
                                                </button>
                                            </td>

                                            {headers.map((header) => (
                                                <td key={header} className="border-b px-2 py-2">
                                                    {row[header] ?? ""}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>

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