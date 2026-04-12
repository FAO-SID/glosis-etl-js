import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import ExcelJS from "exceljs";
import {
  parseProceduresCSV,
  getConversionFactor,
  getReferenceUnit,
  parseDate,
  type PropertyMapping,
  type ProcedureRow,
} from "@/lib/harmonization";

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
      config: {
        sampleIdCol: string;
        longitudeCol: string;
        latitudeCol: string;
        upperDepthCol: string;
        lowerDepthCol: string;
        horizonCol?: string;
        projectName: string;
        projectNameCol?: string;
        siteCode: string;
        siteCodeCol?: string;
        date: string;
        dateCol?: string;
        plotType: string;
        horizonType: string;
        propertyMappings: PropertyMapping[];
        metadata: Record<string, string>;
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

    // Load template workbook
    const templatePath = join(process.cwd(), "public", "glosis_template_v6.xlsx");
    const templateBuffer = await readFile(templatePath);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      templateBuffer.buffer.slice(
        templateBuffer.byteOffset,
        templateBuffer.byteOffset + templateBuffer.byteLength
      ) as ArrayBuffer
    );

    // Group data by unique location => each (lon,lat) = one plot
    const plotGroups = new Map<string, typeof rows>();
    for (const row of rows) {
      const lon = row[config.longitudeCol] || "0";
      const lat = row[config.latitudeCol] || "0";
      const key = lon + "|" + lat;
      if (!plotGroups.has(key)) plotGroups.set(key, []);
      plotGroups.get(key)!.push(row);
    }

    // Build plot info
    const today = new Date().toISOString().split("T")[0];
    const plots = Array.from(plotGroups.entries()).map(([key, plotRows], idx) => {
      const [lon, lat] = key.split("|");
      // Use first row of the group for per-plot column values
      const firstRow = plotRows[0];
      const resolvedProjectName = config.projectNameCol
        ? (firstRow[config.projectNameCol] || config.projectName || "Project")
        : (config.projectName || "Project");
      const resolvedSiteCode = config.siteCodeCol
        ? (firstRow[config.siteCodeCol] || config.siteCode || "Site_1")
        : (config.siteCode || "Site_1");
      const resolvedDate = config.dateCol
        ? parseDate(firstRow[config.dateCol] || today)
        : parseDate(config.date || today);
      return {
        projectName: resolvedProjectName,
        siteCode: resolvedSiteCode,
        plotCode: "plot_" + (idx + 1),
        profileCode: "profile_" + (idx + 1),
        plotType: config.plotType || "TrialPit",
        date: resolvedDate,
        longitude: parseFloat(lon) || 0,
        latitude: parseFloat(lat) || 0,
        nLayers: plotRows.length,
        layers: plotRows,
      };
    });

    // ===== WRITE TO TEMPLATE SHEETS =====
    // Matches the R build_workbook() logic in server.R (lines 1848-2368)

    // ---- Sheet: "Plot Data" — Template headers in row 2, data from row 3 ----
    // Columns: project_name(1), site_code(2), plot_code(3), profile_code(4),
    //   plot_type(5), n_layers(6), date(7), longitude(8), latitude(9),
    //   altitude(10), positional_accuracy(11), extent(12), map_sheet_code(13)
    const plotSheet = wb.getWorksheet("Plot Data");
    if (plotSheet) {
      plots.forEach((plot, i) => {
        const r = 3 + i;
        plotSheet.getCell(r, 1).value = plot.projectName;
        plotSheet.getCell(r, 2).value = plot.siteCode;
        plotSheet.getCell(r, 3).value = plot.plotCode;
        plotSheet.getCell(r, 4).value = plot.profileCode;
        plotSheet.getCell(r, 5).value = plot.plotType;
        plotSheet.getCell(r, 6).value = plot.nLayers;
        plotSheet.getCell(r, 7).value = plot.date;
        plotSheet.getCell(r, 8).value = plot.longitude;
        plotSheet.getCell(r, 9).value = plot.latitude;
      });
    }

    // ---- Sheet: "Profile Data" — Template headers in row 2, data from row 3 ----
    const profileSheet = wb.getWorksheet("Profile Data");
    if (profileSheet) {
      plots.forEach((plot, i) => {
        profileSheet.getCell(3 + i, 1).value = plot.profileCode;
      });
    }

    // ---- Sheet: "Element Data" — Template headers in row 2, data from row 3 ----
    // Columns: profile_code, element_code, type, order_element, upper_depth, lower_depth, horizon_code
    // (R: element_info <- ... select(profile_code, element_code, type, order_element, upper_depth, lower_depth, horizon_code))
    const elementSheet = wb.getWorksheet("Element Data");
    if (elementSheet) {
      let rowIdx = 3;
      for (const plot of plots) {
        for (let li = 0; li < plot.layers.length; li++) {
          const layer = plot.layers[li];
          const elementCode = layer[config.sampleIdCol] || (plot.profileCode + "_" + (li + 1));

          elementSheet.getCell(rowIdx, 1).value = plot.profileCode;
          elementSheet.getCell(rowIdx, 2).value = elementCode;
          elementSheet.getCell(rowIdx, 3).value = config.horizonType || "Horizon";
          elementSheet.getCell(rowIdx, 4).value = li + 1; // order_element
          elementSheet.getCell(rowIdx, 5).value = parseFloat(layer[config.upperDepthCol]) || 0;
          elementSheet.getCell(rowIdx, 6).value = parseFloat(layer[config.lowerDepthCol]) || 0;
          elementSheet.getCell(rowIdx, 7).value = config.horizonCol ? (layer[config.horizonCol] || "") : "";

          rowIdx++;
        }
      }
    }

    // ---- Sheet: "Specimen Data" — colNames=TRUE at row 1, data from row 2 ----
    // Columns: profile_code, element_code, specimen_code, <soil_property_1>, <soil_property_2>, ...
    // Values are CONVERTED using conversion factors
    const specimenSheet = wb.getWorksheet("Specimen Data");
    if (specimenSheet) {
      // Write header row
      const specHeaders = ["profile_code", "element_code", "specimen_code",
        ...config.propertyMappings.map((m) => m.propertyId)];
      specHeaders.forEach((h, ci) => {
        specimenSheet.getCell(1, ci + 1).value = h;
      });

      let rowIdx = 2;
      for (const plot of plots) {
        for (let li = 0; li < plot.layers.length; li++) {
          const layer = plot.layers[li];
          const elementCode = layer[config.sampleIdCol] || (plot.profileCode + "_" + (li + 1));

          specimenSheet.getCell(rowIdx, 1).value = plot.profileCode;
          specimenSheet.getCell(rowIdx, 2).value = elementCode;
          specimenSheet.getCell(rowIdx, 3).value = elementCode; // specimen_code = element_code

          for (let pi = 0; pi < config.propertyMappings.length; pi++) {
            const mapping = config.propertyMappings[pi];
            const rawStr = (layer[mapping.columnName] || "").replace(",", ".");
            const rawValue = parseFloat(rawStr);
            if (isNaN(rawValue)) {
              specimenSheet.getCell(rowIdx, 4 + pi).value = null;
              continue;
            }
            const factor = getConversionFactor(
              procedures, mapping.propertyId, mapping.procedureId, mapping.inputUnit
            );
            const converted = Math.round(rawValue * factor * 1000) / 1000;
            specimenSheet.getCell(rowIdx, 4 + pi).value = converted;
          }
          rowIdx++;
        }
      }
    }

    // ---- Sheet: "Original Data" — colNames=TRUE at row 1, data from row 2 ----
    // Same structure as Specimen Data but with RAW (unconverted) values
    const originalSheet = wb.getWorksheet("Original Data");
    if (originalSheet) {
      // Write header row
      const origHeaders = ["profile_code", "element_code", "specimen_code",
        ...config.propertyMappings.map((m) => m.propertyId)];
      origHeaders.forEach((h, ci) => {
        originalSheet.getCell(1, ci + 1).value = h;
      });

      let rowIdx = 2;
      for (const plot of plots) {
        for (let li = 0; li < plot.layers.length; li++) {
          const layer = plot.layers[li];
          const elementCode = layer[config.sampleIdCol] || (plot.profileCode + "_" + (li + 1));

          originalSheet.getCell(rowIdx, 1).value = plot.profileCode;
          originalSheet.getCell(rowIdx, 2).value = elementCode;
          originalSheet.getCell(rowIdx, 3).value = elementCode;

          for (let pi = 0; pi < config.propertyMappings.length; pi++) {
            const mapping = config.propertyMappings[pi];
            const rawStr = (layer[mapping.columnName] || "").replace(",", ".");
            const rawValue = parseFloat(rawStr);
            originalSheet.getCell(rowIdx, 4 + pi).value = isNaN(rawValue) ? null : rawValue;
          }
          rowIdx++;
        }
      }
    }

    // ---- Sheet: "Procedures" — Template header in row 1, data from row 2 ----
    // Columns: soil_property, property_phys_chem_id, procedure_phys_chem_id, unit_of_measure_id
    const proceduresSheet = wb.getWorksheet("Procedures");
    if (proceduresSheet) {
      config.propertyMappings.forEach((mapping, i) => {
        const r = 2 + i;
        proceduresSheet.getCell(r, 1).value = mapping.columnName;
        proceduresSheet.getCell(r, 2).value = mapping.propertyId;
        proceduresSheet.getCell(r, 3).value = mapping.procedureId;
        proceduresSheet.getCell(r, 4).value = getReferenceUnit(procedures, mapping.propertyId, mapping.procedureId) || mapping.inputUnit;
      });
    }

    // ---- Sheet: "Metadata" — Template headers in row 2, data from row 3 ----
    // Columns: plot_code(1), name(2), honorific_title(3), role(4), email(5),
    //   telephone(6), url(7), organization(8), street_address(9),
    //   postal_code(10), locality(11), country(12)
    const metaSheet = wb.getWorksheet("Metadata");
    if (metaSheet && config.metadata) {
      const meta = config.metadata;
      const metaValues = [
        meta.name || "", meta.honorific_title || "", meta.role || "",
        meta.email || "", meta.telephone || "", meta.url || "",
        meta.organization || "", meta.street_address || "",
        meta.postal_code || "", meta.locality || "", meta.country || "",
      ];

      plots.forEach((plot, i) => {
        const r = 3 + i;
        metaSheet.getCell(r, 1).value = plot.plotCode;
        metaValues.forEach((val, j) => {
          if (val) metaSheet.getCell(r, 2 + j).value = val;
        });
      });
    }

    // Generate output
    const buffer = await wb.xlsx.writeBuffer();
    const uint8 = new Uint8Array(buffer as ArrayBuffer);

    return new NextResponse(uint8, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=\"GloSIS_harmonized_" + new Date().toISOString().split("T")[0] + ".xlsx\"",
      },
    });
  } catch (error) {
    console.error("Harmonization error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
