import {parseSpreadsheetPreview, type SpreadsheetUploadRow, validateSpreadsheetFile,} from "@/lib/excel-preview";

export type ParsedSpreadsheetRow = SpreadsheetUploadRow;

export async function parseExcel(file: File): Promise<ParsedSpreadsheetRow[]> {
    validateSpreadsheetFile(file);

    const extension = (file.name.split(".").pop() ?? "").toLowerCase();
    if (extension !== "xlsx") {
        throw new Error("엑셀 미리보기는 .xlsx 파일만 지원합니다.");
    }

    const result = await parseSpreadsheetPreview(file);
    return result.rows;
}

export async function parseCSV(file: File): Promise<ParsedSpreadsheetRow[]> {
    validateSpreadsheetFile(file);

    const extension = (file.name.split(".").pop() ?? "").toLowerCase();
    if (extension !== "csv") {
        throw new Error("CSV 미리보기는 .csv 파일만 지원합니다.");
    }

    const result = await parseSpreadsheetPreview(file);
    return result.rows;
}