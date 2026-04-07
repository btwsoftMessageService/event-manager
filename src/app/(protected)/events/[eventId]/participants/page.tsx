"use client";

import React, {useEffect, useMemo, useRef, useState} from "react";
import {useParams} from "next/navigation";
import * as XLSX from "xlsx";

/* =========================================================
 * 타입 정의
 * ========================================================= */

/**
 * 이벤트 참가자 타입
 * - 이벤트별 참가자 관리 화면에서 사용하는 기본 구조
 */
type Participant = {
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    role?: string;
    ticketType?: string;
    note?: string;
};

/**
 * mock / 템플릿 생성용 구체 타입
 * - Row/Record 계열 추론 꼬임 피하려고 명시적으로 둠
 */
type ParticipantTemplateRow = {
    name: string;
    email: string;
    phone: string;
    company: string;
    role: string;
    ticketType: string;
    note: string;
};

/* =========================================================
 * 상수
 * ========================================================= */

const STORAGE_KEY_PREFIX = "event-manager:participants:";

/**
 * 화면/엑셀 컬럼 정의
 * - key: 내부 필드명
 * - label: 엑셀 헤더 및 테이블 헤더 표시명
 */
const TEMPLATE_HEADERS: Array<{
    key: keyof Participant;
    label: string;
    required?: boolean;
}> = [
    {key: "name", label: "이름", required: true},
    {key: "email", label: "이메일"},
    {key: "phone", label: "전화번호"},
    {key: "company", label: "회사"},
    {key: "role", label: "직함/역할"},
    {key: "ticketType", label: "티켓구분"},
    {key: "note", label: "비고"},
];

/**
 * 업로드 헤더 alias
 * - 한글/영문 헤더를 내부 필드로 매핑
 */
const HEADER_ALIASES: Record<string, keyof Participant> = {
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
    티켓: "ticketType",
    티켓구분: "ticketType",
    비고: "note",
    메모: "note",

    // en
    name: "name",
    email: "email",
    phone: "phone",
    company: "company",
    role: "role",
    title: "role",
    tickettype: "ticketType",
    ticket_type: "ticketType",
    note: "note",
};

/* =========================================================
 * 유틸
 * ========================================================= */

/** 헤더 비교용 정규화 */
function sanitizeHeader(value: unknown): string {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, "")
        .toLowerCase();
}

/** 파일 다운로드 */
function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

/**
 * 참가자 배열 -> xlsx Blob
 * - 현재 목록 다운로드 / 샘플 다운로드에 공용 사용
 */
function makeWorkbookBlob(rows: Participant[]): Blob {
    const sheetRows: Array<Record<string, string>> = rows.map((row) => {
        const obj: Record<string, string> = {};

        TEMPLATE_HEADERS.forEach((header) => {
            obj[header.label] = String(row[header.key] ?? "");
        });

        return obj;
    });

    const worksheet = XLSX.utils.json_to_sheet(sheetRows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "participants");

    const buffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
    });

    return new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
}

/** 샘플 엑셀 생성 */
function makeSampleWorkbookBlob(): Blob {
    const sampleRows: ParticipantTemplateRow[] = [
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

    const rows: Participant[] = sampleRows.map((item) => ({
        name: item.name,
        email: item.email,
        phone: item.phone,
        company: item.company,
        role: item.role,
        ticketType: item.ticketType,
        note: item.note,
    }));

    return makeWorkbookBlob(rows);
}

/**
 * 업로드 파일 파싱
 * - csv / xlsx / xls 지원
 * - 첫 번째 시트 기준
 * - 첫 줄은 헤더
 */
async function parseFileToParticipants(
    file: File
): Promise<{ rows: Participant[]; warnings: string[] }> {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();

    let workbook: XLSX.WorkBook;

    if (ext === "csv") {
        const text = await file.text();
        workbook = XLSX.read(text, {type: "string"});
    } else {
        const buffer = await file.arrayBuffer();
        workbook = XLSX.read(buffer, {type: "array"});
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
        throw new Error("엑셀 시트를 찾지 못했습니다.");
    }

    const worksheet = workbook.Sheets[firstSheetName];
    if (!worksheet) {
        throw new Error("엑셀 시트를 찾지 못했습니다.");
    }

    const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
        header: 1,
        defval: "",
        blankrows: false,
    });

    if (!matrix.length) {
        throw new Error("엑셀에 데이터가 없습니다.");
    }

    const rawHeaders = (matrix[0] ?? []).map((value) => String(value ?? "").trim());

    const headerMap: Array<keyof Participant | null> = rawHeaders.map((header) => {
        const mapped = HEADER_ALIASES[header] ?? HEADER_ALIASES[sanitizeHeader(header)];
        return mapped ?? null;
    });

    if (!headerMap.includes("name")) {
        throw new Error(
            "헤더(첫 줄)에 '이름' 컬럼이 필요합니다. 샘플 엑셀을 다운로드해서 형식을 맞춰주세요."
        );
    }

    const warnings: string[] = [];
    const rows: Participant[] = [];

    matrix.slice(1).forEach((line, index) => {
        const participant: Participant = {name: ""};

        headerMap.forEach((fieldKey, fieldIndex) => {
            if (!fieldKey) return;

            const text = String(line?.[fieldIndex] ?? "").trim();
            if (!text) return;

            participant[fieldKey] = text;
        });

        if (!participant.name) {
            warnings.push(`${index + 2}행: 이름이 비어 있어 제외했습니다.`);
            return;
        }

        rows.push(participant);
    });

    return {rows, warnings};
}

/* =========================================================
 * 페이지
 * ========================================================= */

export default function ParticipantsPage() {
    const params = useParams();
    const eventIdParam = params?.eventId;
    const eventId =
        typeof eventIdParam === "string"
            ? eventIdParam
            : Array.isArray(eventIdParam)
                ? (eventIdParam[0] ?? "")
                : "";

    const storageKey = useMemo(() => `${STORAGE_KEY_PREFIX}${eventId}`, [eventId]);

    const inputRef = useRef<HTMLInputElement | null>(null);

    const [dragOver, setDragOver] = useState(false);
    const [rows, setRows] = useState<Participant[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [error, setError] = useState<string>("");
    const [info, setInfo] = useState<string>("");

    /* =========================================================
     * localStorage 로드
     * ========================================================= */

    useEffect(() => {
        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return;

            const parsed = JSON.parse(raw) as Participant[];
            if (Array.isArray(parsed)) {
                setRows(parsed);
            }
        } catch {
            // ignore
        }
    }, [storageKey]);

    /* =========================================================
     * localStorage 저장
     * ========================================================= */

    useEffect(() => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(rows));
        } catch {
            // ignore
        }
    }, [rows, storageKey]);

    /* =========================================================
     * 파일 업로드
     * ========================================================= */

    const onPickFile = () => {
        inputRef.current?.click();
    };

    const handleFile = async (file: File) => {
        setError("");
        setInfo("");
        setWarnings([]);

        const ext = (file.name.split(".").pop() ?? "").toLowerCase();
        const allowed = ["xlsx", "xls", "csv"].includes(ext);

        if (!allowed) {
            setError("지원하지 않는 형식입니다. .xlsx / .xls / .csv 파일만 업로드해주세요.");
            return;
        }

        try {
            const parsed = await parseFileToParticipants(file);

            const existingKeys = new Set<string>();
            const nextRows: Participant[] = [];

            // 기존 데이터부터 중복 키 기록
            rows.forEach((row) => {
                const key = `${(row.email ?? "").trim().toLowerCase()}|${row.name.trim()}|${(
                    row.phone ?? ""
                ).trim()}`;
                existingKeys.add(key);
                nextRows.push(row);
            });

            // 신규 데이터 추가
            let addedCount = 0;

            parsed.rows.forEach((row) => {
                const key = `${(row.email ?? "").trim().toLowerCase()}|${row.name.trim()}|${(
                    row.phone ?? ""
                ).trim()}`;

                if (existingKeys.has(key)) {
                    return;
                }

                existingKeys.add(key);
                nextRows.push(row);
                addedCount += 1;
            });

            setRows(nextRows);
            setWarnings(parsed.warnings);
            setInfo(
                `업로드 완료: ${addedCount.toLocaleString()}명 추가 (현재 ${nextRows.length.toLocaleString()}명)`
            );
        } catch (e) {
            if (e instanceof Error) {
                setError(e.message);
            } else {
                setError("업로드 처리 중 오류가 발생했습니다.");
            }
        }
    };

    const onInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            await handleFile(file);
        }

        event.target.value = "";
    };

    const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragOver(false);

        const file = event.dataTransfer.files?.[0];
        if (file) {
            await handleFile(file);
        }
    };

    /* =========================================================
     * 다운로드
     * ========================================================= */

    const downloadSample = () => {
        try {
            const blob = makeSampleWorkbookBlob();
            downloadBlob(blob, "participants-sample.xlsx");
        } catch {
            setError("샘플 파일 생성에 실패했습니다.");
        }
    };

    const downloadCurrent = () => {
        try {
            if (!rows.length) {
                setInfo("현재 업로드된 데이터가 없습니다.");
                return;
            }

            const blob = makeWorkbookBlob(rows);
            downloadBlob(blob, `participants-${eventId || "event"}.xlsx`);
        } catch {
            setError("현재 데이터 다운로드에 실패했습니다.");
        }
    };

    /* =========================================================
     * 기타 액션
     * ========================================================= */

    const clearAll = () => {
        setRows([]);
        setWarnings([]);
        setError("");
        setInfo("초기화 완료 (프로토타입: localStorage도 비움)");

        try {
            localStorage.removeItem(storageKey);
        } catch {
            // ignore
        }
    };

    return (
        <main className="p-6 text-gray-900">
            {/* 상단 헤더 */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-black">Participants</h1>
                    <p className="mt-1 text-sm text-gray-700">
                        eventId: <span className="font-medium">{eventId || "-"}</span>
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

            {/* 메시지 */}
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
                        {warnings.slice(0, 10).map((warning, index) => (
                            <li key={index}>{warning}</li>
                        ))}
                    </ul>

                    {warnings.length > 10 ? (
                        <div className="mt-2 text-xs text-amber-700">
                            … 외 {warnings.length - 10}건
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* 업로드 영역 */}
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
                            .xlsx / .xls / .csv 지원 (첫 번째 시트, 첫 줄은 헤더)
                        </div>
                        <div className="text-xs text-gray-500">
                            프로토타입: 업로드 데이터는 브라우저(localStorage)에 저장됩니다.
                        </div>

                        <div className="mt-3 flex gap-2">
                            <button
                                onClick={onPickFile}
                                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                            >
                                파일 선택
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
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            onChange={onInputChange}
                        />
                    </div>
                </div>
            </section>

            {/* 요약 */}
            <section className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">현재 참가자 수</div>
                    <div className="mt-2 text-2xl font-semibold text-black">
                        {rows.length.toLocaleString()} 명
                    </div>
                    <div className="mt-1 text-xs text-gray-500">이벤트별 localStorage 임시 저장</div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">필수 컬럼</div>
                    <div className="mt-2 text-sm text-gray-800">이름(필수)</div>
                    <div className="mt-1 text-xs text-gray-500">이메일/전화/회사/역할 등은 선택</div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm font-medium text-gray-700">다운로드</div>
                    <div className="mt-2 text-sm text-gray-800">샘플 / 현재 데이터</div>
                    <div className="mt-1 text-xs text-gray-500">현재 화면 데이터 기준</div>
                </div>
            </section>

            {/* 참가자 테이블 */}
            <section className="mt-6 rounded-2xl border bg-white">
                <div className="flex items-center justify-between gap-3 border-b p-4">
                    <div>
                        <h2 className="text-lg font-semibold text-black">업로드된 참가자 목록</h2>
                        <p className="mt-1 text-sm text-gray-600">
                            프로토타입 단계: 이후 API 연동 시 서버 데이터로 교체
                        </p>
                    </div>
                </div>

                {rows.length === 0 ? (
                    <div className="p-6 text-sm text-gray-600">아직 업로드된 참가자가 없습니다.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-[980px] w-full border-collapse text-left text-sm">
                            <thead className="bg-gray-50 text-gray-700">
                            <tr>
                                {TEMPLATE_HEADERS.map((header) => (
                                    <th key={header.key} className="border-b px-4 py-3 font-semibold">
                                        {header.label}
                                        {header.required ? <span className="ml-1 text-red-500">*</span> : null}
                                    </th>
                                ))}
                            </tr>
                            </thead>

                            <tbody>
                            {rows.slice(0, 500).map((row, index) => (
                                <tr key={index} className="odd:bg-white even:bg-gray-50/50">
                                    {TEMPLATE_HEADERS.map((header) => (
                                        <td key={header.key} className="border-b px-4 py-3 text-gray-900">
                                            {String(row[header.key] ?? "")}
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