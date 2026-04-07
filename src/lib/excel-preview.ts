import readXlsxFile from "read-excel-file";

export type SpreadsheetUploadRow = {
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    role?: string;
};

export type SpreadsheetPreviewResult = {
    rows: SpreadsheetUploadRow[];
    warnings: string[];
    headers: string[];
};

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

const HEADER_ALIASES: Record<string, keyof SpreadsheetUploadRow> = {
    // ko
    이름: "name",
    성명: "name",
    이메일: "email",
    메일: "email",
    전화번호: "phone",
    휴대폰: "phone",
    연락처: "phone",
    회사: "company",
    소속: "company",
    직함: "role",
    역할: "role",
    "직함/역할": "role",

    // en
    name: "name",
    email: "email",
    phone: "phone",
    mobile: "phone",
    company: "company",
    organization: "company",
    role: "role",
    title: "role",
};

function sanitizeHeader(value: unknown): string {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, "")
        .toLowerCase();
}

function normalizeCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];

        if (char === "\"") {
            if (inQuotes && next === "\"") {
                current += "\"";
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === "," && !inQuotes) {
            result.push(current);
            current = "";
            continue;
        }

        current += char;
    }

    result.push(current);
    return result.map((item) => item.trim());
}

function parseCsvText(text: string): string[][] {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    return normalized
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map(parseCsvLine);
}

async function readSpreadsheetMatrix(file: File): Promise<unknown[][]> {
    const extension = (file.name.split(".").pop() ?? "").toLowerCase();

    if (extension === "csv") {
        const text = await file.text();
        return parseCsvText(text);
    }

    if (extension !== "xlsx") {
        throw new Error("지원하지 않는 파일 형식입니다. .xlsx 또는 .csv만 업로드해주세요.");
    }

    return readXlsxFile(file);
}

function mapHeaders(rawHeaders: string[]): Array<keyof SpreadsheetUploadRow | null> {
    return rawHeaders.map((header) => {
        const exact = HEADER_ALIASES[header];
        if (exact) return exact;

        const sanitized = sanitizeHeader(header);
        return HEADER_ALIASES[sanitized] ?? null;
    });
}

export function validateSpreadsheetFile(file: File) {
    const extension = (file.name.split(".").pop() ?? "").toLowerCase();

    if (!["xlsx", "csv"].includes(extension)) {
        throw new Error("지원하지 않는 파일 형식입니다. .xlsx 또는 .csv만 업로드해주세요.");
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error("파일 크기는 2MB 이하여야 합니다.");
    }
}

export async function parseSpreadsheetPreview(
    file: File
): Promise<SpreadsheetPreviewResult> {
    validateSpreadsheetFile(file);

    const matrix = await readSpreadsheetMatrix(file);

    if (!matrix.length) {
        throw new Error("업로드한 파일에 데이터가 없습니다.");
    }

    const rawHeaders = (matrix[0] ?? []).map((cell) => normalizeCell(cell));
    const headerMap = mapHeaders(rawHeaders);

    if (!headerMap.includes("name")) {
        throw new Error(
            "헤더(첫 줄)에 '이름' 컬럼이 필요합니다. 샘플 파일 형식에 맞춰 다시 업로드해주세요."
        );
    }

    const warnings: string[] = [];
    const rows: SpreadsheetUploadRow[] = [];

    for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
        const sourceRow = matrix[rowIndex] ?? [];
        const row: SpreadsheetUploadRow = {
            name: "",
        };

        headerMap.forEach((mappedKey, columnIndex) => {
            if (!mappedKey) return;

            const rawValue = sourceRow[columnIndex];
            const value = normalizeCell(rawValue);

            if (!value) return;

            if (mappedKey === "name") row.name = value;
            if (mappedKey === "email") row.email = value;
            if (mappedKey === "phone") row.phone = value;
            if (mappedKey === "company") row.company = value;
            if (mappedKey === "role") row.role = value;
        });

        if (!row.name) {
            warnings.push(`${rowIndex + 1}행: 이름이 비어 있어 제외했습니다.`);
            continue;
        }

        rows.push(row);
    }

    return {
        rows,
        warnings,
        headers: rawHeaders,
    };
}

function escapeCsvCell(value: string): string {
    if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
        return `"${value.replace(/"/g, "\"\"")}"`;
    }

    return value;
}

export function buildCsvContent(
    headers: string[],
    rows: Array<Array<string | number | undefined | null>>
): string {
    const headerLine = headers.map((item) => escapeCsvCell(String(item ?? ""))).join(",");

    const bodyLines = rows.map((row) =>
        row
            .map((cell) => escapeCsvCell(String(cell ?? "")))
            .join(",")
    );

    return [headerLine, ...bodyLines].join("\n");
}

export function downloadTextFile(
    content: string,
    fileName: string,
    mimeType = "text/csv;charset=utf-8;"
) {
    const blob = new Blob(["\uFEFF", content], {type: mimeType});
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
}

export function downloadCsvFile(
    headers: string[],
    rows: Array<Array<string | number | undefined | null>>,
    fileName: string
) {
    const content = buildCsvContent(headers, rows);
    downloadTextFile(content, fileName);
}