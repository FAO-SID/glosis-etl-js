// Inject API — Upload XLSX and inject into DB
// Reads all XLSX sheets, merges them, and injects into the GloSIS database
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { injectData } from "@/lib/standardization/db-inject";

type Row = Record<string, string | number | null>;

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const dbName = formData.get("dbName") as string;
        const file = formData.get("file") as File;

        if (!dbName || !file) {
            return NextResponse.json({ error: "Database name and XLSX file are required" }, { status: 400 });
        }

        // Parse XLSX
        const arrayBuffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer as ArrayBuffer);

        console.log("[inject] Sheet names:", workbook.worksheets.map((ws) => ws.name));

        // ── Read each sheet ──
        const plotRows = readSheet(workbook, "Plot Data");
        const profileRows = readSheet(workbook, "Profile Data");
        const elementRows = readSheet(workbook, "Element Data");
        const specimenRows = readSheet(workbook, "Specimen Data");
        const metadataRows = readSheet(workbook, "Metadata");

        console.log(`[inject] Plot: ${plotRows.length}, Profile: ${profileRows.length}, Element: ${elementRows.length}, Specimen: ${specimenRows.length}, Metadata: ${metadataRows.length}`);

        // DEBUG: Look closely at Element Data keys
        if (elementRows.length > 0) {
            console.log(`[inject] Element sheet headers detected:`, Object.keys(elementRows[0]).join(", "));
            console.log(`[inject] Element row 1 depths: upper=${elementRows[0].upper_depth}, lower=${elementRows[0].lower_depth}`);
        }

        // ── Merge into combined rows (one row per element/specimen) ──
        // The R version works with a single combined tibble (site_tibble)
        const combinedData = mergeSheets(plotRows, profileRows, elementRows, specimenRows, metadataRows);
        console.log(`[inject] Combined: ${combinedData.length} rows`);

        if (combinedData.length > 0) {
            // Collect ALL keys across ALL rows (since some rows might lack joined specimen data)
            const allKeys = new Set<string>();
            combinedData.forEach(r => Object.keys(r).forEach(k => allKeys.add(k)));
            console.log(`[inject] All unique columns in combined data (${allKeys.size}):`, Array.from(allKeys).join(", "));
            console.log(`[inject] Sample: project=${combinedData[0].project_name}, site=${combinedData[0].site_code}, upper_depth=${combinedData[0].upper_depth}, lower_depth=${combinedData[0].lower_depth}`);
        }

        // ── Read Procedures ──
        const procSheet = workbook.worksheets.find((ws) => ws.name.toLowerCase().includes("procedure"));
        let procedures: { property_phys_chem_id: string; procedure_phys_chem_id: string; unit_of_measure_id: string }[] = [];
        if (procSheet) {
            const procRows = sheetToJson(procSheet);
            procedures = procRows
                .map((row) => ({
                    property_phys_chem_id: String(row.property_phys_chem_id || ""),
                    procedure_phys_chem_id: String(row.procedure_phys_chem_id || ""),
                    unit_of_measure_id: String(row.unit_of_measure_id || ""),
                }))
                .filter((p) => p.property_phys_chem_id && p.procedure_phys_chem_id);
            console.log(`[inject] Procedures: ${procedures.length}`);
        }

        // Run injection
        const result = await injectData(dbName, combinedData, procedures);
        console.log(`[inject] Result:`, JSON.stringify(result.counts));
        if (result.errors.length > 0) {
            console.log(`[inject] First 5 errors:`, result.errors.slice(0, 5));
        }
        return NextResponse.json(result, { status: result.success ? 200 : 500 });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error("[POST /api/databases/inject]", error);
        return NextResponse.json({ success: false, message: msg, errors: [msg], counts: {} }, { status: 500 });
    }
}

// ── Read a specific sheet by name with auto-detect 2-row headers ──
function readSheet(workbook: ExcelJS.Workbook, sheetName: string): Row[] {
    const ws = workbook.worksheets.find(
        (s) => s.name.toLowerCase() === sheetName.toLowerCase()
    );
    if (!ws) {
        console.log(`[inject] Sheet "${sheetName}" not found`);
        return [];
    }
    return sheetToJson(ws);
}

// ── Merge all sheets into a combined dataset ──
// Joins on profile_code (Element→Plot) and plot_code (Metadata→Plot)
function mergeSheets(
    plotRows: Row[],
    profileRows: Row[],
    elementRows: Row[],
    specimenRows: Row[],
    metadataRows: Row[]
): Row[] {
    // Index plot rows by profile_code
    const plotByProfile = new Map<string, Row>();
    const plotByPlotCode = new Map<string, Row>();
    for (const row of plotRows) {
        const profileCode = str(row.profile_code);
        const plotCode = str(row.plot_code);
        if (profileCode) plotByProfile.set(profileCode, row);
        if (plotCode) plotByPlotCode.set(plotCode, row);
    }

    // Index profile rows by profile_code
    const profileByCode = new Map<string, Row>();
    for (const row of profileRows) {
        const code = str(row.profile_code);
        if (code) profileByCode.set(code, row);
    }

    // Index specimen rows by profile_code + element_code
    const specimenByKey = new Map<string, Row>();
    for (const row of specimenRows) {
        const key = `${str(row.profile_code)}|${str(row.element_code)}`;
        if (key !== "|") specimenByKey.set(key, row);
    }

    // Index metadata rows by plot_code (take first match)
    const metaByPlotCode = new Map<string, Row>();
    for (const row of metadataRows) {
        const plotCode = str(row.plot_code);
        if (plotCode && !metaByPlotCode.has(plotCode)) {
            metaByPlotCode.set(plotCode, row);
        }
    }

    // If we have element rows, each element row becomes a combined row
    if (elementRows.length > 0) {
        const combined: Row[] = [];
        for (const elemRow of elementRows) {
            const profileCode = str(elemRow.profile_code);
            if (!profileCode) continue;

            // Find matching plot row
            const plotRow = plotByProfile.get(profileCode) || {};

            // Find matching profile descriptors
            const profileRow = profileByCode.get(profileCode) || {};

            // Find matching specimen
            const elementCode = str(elemRow.element_code) || str(elemRow.order_element);
            const specimenKey = `${profileCode}|${elementCode}`;
            const specimenRow = specimenByKey.get(specimenKey) || {};

            // Find matching metadata
            const plotCode = str(plotRow.plot_code) || "";
            const metaRow = metaByPlotCode.get(plotCode) || {};

            // Merge all (plot base, then profile, then element, then specimen, then metadata)
            // Later values override earlier ones
            combined.push({
                ...plotRow,
                ...profileRow,
                ...elemRow,
                ...specimenRow,
                ...metaRow,
                // Ensure critical fields from plotRow aren't overwritten
                project_name: plotRow.project_name ?? null,
                site_code: plotRow.site_code ?? null,
                plot_code: plotRow.plot_code ?? null,
                profile_code: profileCode,
            });
        }
        return combined;
    }

    // Fallback: if no element rows, just return plot data with metadata
    return plotRows.map((plotRow) => {
        const plotCode = str(plotRow.plot_code) || "";
        const metaRow = metaByPlotCode.get(plotCode) || {};
        return { ...plotRow, ...metaRow };
    });
}

// ── Helper ──
function str(v: unknown): string {
    if (v === null || v === undefined || v === "") return "";
    return String(v);
}

// ── Convert ExcelJS worksheet to array of objects ──
// Auto-detects whether row 1 or row 2 contains actual column headers
function sheetToJson(sheet: ExcelJS.Worksheet): Row[] {
    const rows: Row[] = [];

    // Read row 1 and row 2
    const row1vals: string[] = [];
    const row2vals: string[] = [];
    sheet.getRow(1).eachCell((cell, col) => { row1vals[col] = String(cell.value || "").trim(); });
    sheet.getRow(2).eachCell((cell, col) => { row2vals[col] = String(cell.value || "").trim(); });

    // Known DB column names to detect the header row
    const knownColumns = [
        "project_name", "site_code", "plot_code", "profile_code",
        "longitude", "latitude", "upper_depth", "lower_depth",
        "element_code", "specimen_code", "order_element", "type",
        "property_phys_chem_id", "procedure_phys_chem_id",
        "name", "email", "organization", "plot_code"
    ];

    const row1Match = row1vals.filter((v) => knownColumns.includes(v)).length;
    const row2Match = row2vals.filter((v) => knownColumns.includes(v)).length;

    const headerRow = row2Match > row1Match ? 2 : 1;
    const dataStartRow = headerRow + 1;
    const headers = headerRow === 2 ? row2vals : row1vals;

    // Read data rows
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber < dataStartRow) return;

        const obj: Row = {};
        let hasValue = false;

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const key = headers[colNumber];
            if (!key) return;

            const val = cell.value;
            if (val === null || val === undefined || val === "") {
                obj[key] = null;
            } else if (typeof val === "object" && val !== null && "result" in val) {
                obj[key] = (val as { result: unknown }).result as string | number;
                hasValue = true;
            } else if (val instanceof Date) {
                obj[key] = val.toISOString().split("T")[0];
                hasValue = true;
            } else {
                obj[key] = val as string | number;
                hasValue = true;
            }
        });

        if (hasValue) {
            rows.push(obj);
        }
    });

    return rows;
}
