import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import ExcelJS from "exceljs";
import {
    parseProceduresCSV,
    type ProcedureRow,
    type PropertyMapping,
} from "@/lib/harmonization";
import { runQCChecks, type QCConfig, type QCResults, type QCIssueRow } from "@/lib/qc-checks";

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return { headers: [], rows: [] };
    const sep = lines[0].includes(";") ? ";" : ",";
    const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"(.*)"$/, "$1"));
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(sep).map((v) => v.trim().replace(/^"(.*)"$/, "$1"));
        const row: Record<string, string> = {};
        headers.forEach((h, j) => { row[h] = vals[j] || ""; });
        rows.push(row);
    }
    return { headers, rows };
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { csvText, config } = body as {
            csvText: string;
            config: QCConfig & {
                propertyMappings: PropertyMapping[];
            };
        };

        const { rows } = parseCSV(csvText);
        if (rows.length === 0) {
            return NextResponse.json({ error: "No data rows found" }, { status: 400 });
        }

        // Load procedures reference
        const procPath = join(process.cwd(), "public", "glosis_procedures_v2.csv");
        const procText = await readFile(procPath, "utf-8");
        const procedures: ProcedureRow[] = parseProceduresCSV(procText);

        // Run all 13 QC checks
        const results: QCResults = runQCChecks(rows, config, procedures);

        // Build QC report workbook
        const wb = new ExcelJS.Workbook();

        // ---- Summary sheet ----
        const summarySheet = wb.addWorksheet("Summary");
        summarySheet.columns = [
            { header: "check", key: "check", width: 40 },
            { header: "n_rows", key: "n_rows", width: 12 },
        ];
        const checkNames = Object.keys(results) as (keyof QCResults)[];
        for (const name of checkNames) {
            summarySheet.addRow({ check: name, n_rows: results[name].length });
        }
        // Bold header row
        summarySheet.getRow(1).font = { bold: true };
        summarySheet.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];

        // ---- One sheet per QC check ----
        const sheetOrder: (keyof QCResults)[] = [
            "non_numeric_coords_df",
            "non_numeric_depth_df",
            "non_numeric_props_df",
            "duplicates_df",
            "missing_coords_df",
            "missing_depth_df",
            "bad_depth_df",
            "invalid_dates_df",
            "invalid_profile_code_df",
            "profile_inconsistent_df",
            "invalid_plot_code_df",
            "plot_inconsistent_df",
            "out_of_range_df",
        ];

        for (const name of sheetOrder) {
            // Sheet names max 31 chars
            const sheetName = name.replace(/_df$/, "").substring(0, 31);
            const sheet = wb.addWorksheet(sheetName);

            const issueRows: QCIssueRow[] = results[name];

            if (issueRows.length === 0) {
                sheet.addRow(["No issues found."]);
                continue;
            }

            // Collect all unique keys across all rows
            const allKeys = new Set<string>();
            for (const row of issueRows) {
                Object.keys(row).forEach((k) => allKeys.add(k));
            }
            const keys = Array.from(allKeys);

            // Header row
            sheet.columns = keys.map((k) => ({ header: k, key: k, width: 18 }));

            // Data rows
            for (const row of issueRows) {
                const dataRow: Record<string, string | number | null> = {};
                for (const k of keys) {
                    dataRow[k] = row[k] ?? "";
                }
                sheet.addRow(dataRow);
            }

            // Bold header, freeze pane
            sheet.getRow(1).font = { bold: true };
            sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
        }

        // Generate output
        const buffer = await wb.xlsx.writeBuffer();
        const uint8 = new Uint8Array(buffer as ArrayBuffer);

        return new NextResponse(uint8, {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="QC_report_${new Date().toISOString().split("T")[0]}.xlsx"`,
            },
        });
    } catch (error) {
        console.error("QC report error:", error);
        const msg = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
