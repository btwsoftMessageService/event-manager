import ExcelJS from "exceljs";
import Papa from "papaparse";

export async function parseExcel(file: File): Promise<any[]> {
    const buffer = await file.arrayBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    const rows: any[] = [];

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const values = row.values as any[];

        rows.push({
            name: values[1],
            email: values[2],
            phone: values[3]
        });
    });

    return rows;
}

export function parseCSV(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            complete: (result) => resolve(result.data as any[]),
            error: reject
        });
    });
}