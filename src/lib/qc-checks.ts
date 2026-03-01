/**
 * QC Data Validation Checks — ported from server.R (lines 956–1388)
 *
 * Pure functions: data in → issues out. No framework dependency.
 */

import {
    getConversionFactor,
    getReferenceUnit,
    type ProcedureRow,
    type PropertyMapping,
} from "./harmonization";

// ---------- Types ----------

export interface QCIssueRow {
    row_in_input: number;
    texid: string;
    X: string;
    Y: string;
    top: string;
    bottom: string;
    [key: string]: string | number | null;
}

export interface QCResults {
    non_numeric_coords_df: QCIssueRow[];
    non_numeric_depth_df: QCIssueRow[];
    non_numeric_props_df: QCIssueRow[];
    duplicates_df: QCIssueRow[];
    missing_coords_df: QCIssueRow[];
    missing_depth_df: QCIssueRow[];
    bad_depth_df: QCIssueRow[];
    invalid_dates_df: QCIssueRow[];
    invalid_profile_code_df: QCIssueRow[];
    profile_inconsistent_df: QCIssueRow[];
    invalid_plot_code_df: QCIssueRow[];
    plot_inconsistent_df: QCIssueRow[];
    out_of_range_df: QCIssueRow[];
}

export interface QCConfig {
    sampleIdCol: string;
    longitudeCol: string;
    latitudeCol: string;
    upperDepthCol: string;
    lowerDepthCol: string;
    horizonCol?: string;
    dateCol?: string;
    useDate?: boolean;
    profileCodeCol?: string;
    useProfileCode?: boolean;
    plotCodeCol?: string;
    usePlotCode?: boolean;
    propertyMappings: PropertyMapping[];
    selectedProps: string[];
}

// ---------- Helpers ----------

function numify(val: string | undefined | null): number | null {
    if (val == null) return null;
    const s = String(val).trim().replace(",", ".");
    if (s === "" || s === "NA") return null;
    const n = Number(s);
    return isNaN(n) ? null : n;
}

function isNonEmpty(val: string | undefined | null): boolean {
    if (val == null) return false;
    const s = String(val).trim();
    return s !== "" && s !== "NA";
}

function baseRow(row: Record<string, string>, idx: number, cfg: QCConfig): QCIssueRow {
    return {
        row_in_input: idx + 1, // 1-indexed
        texid: row[cfg.sampleIdCol] || "",
        X: row[cfg.longitudeCol] || "",
        Y: row[cfg.latitudeCol] || "",
        top: row[cfg.upperDepthCol] || "",
        bottom: row[cfg.lowerDepthCol] || "",
    };
}

// ---------- Main function ----------

export function runQCChecks(
    rows: Record<string, string>[],
    config: QCConfig,
    procedures: ProcedureRow[]
): QCResults {
    const results: QCResults = {
        non_numeric_coords_df: [],
        non_numeric_depth_df: [],
        non_numeric_props_df: [],
        duplicates_df: [],
        missing_coords_df: [],
        missing_depth_df: [],
        bad_depth_df: [],
        invalid_dates_df: [],
        invalid_profile_code_df: [],
        profile_inconsistent_df: [],
        invalid_plot_code_df: [],
        plot_inconsistent_df: [],
        out_of_range_df: [],
    };

    // Pre-parse numeric values
    const xNums = rows.map((r) => numify(r[config.longitudeCol]));
    const yNums = rows.map((r) => numify(r[config.latitudeCol]));
    const topNums = rows.map((r) => numify(r[config.upperDepthCol]));
    const botNums = rows.map((r) => numify(r[config.lowerDepthCol]));

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const br = baseRow(row, i, config);

        // ---- Check 1: Non-numeric coordinates ----
        const lonRaw = row[config.longitudeCol];
        const latRaw = row[config.latitudeCol];
        const lonNonNum = isNonEmpty(lonRaw) && xNums[i] === null;
        const latNonNum = isNonEmpty(latRaw) && yNums[i] === null;
        if (lonNonNum || latNonNum) {
            const issues: string[] = [];
            if (lonNonNum) issues.push("lon_not_numeric");
            if (latNonNum) issues.push("lat_not_numeric");
            results.non_numeric_coords_df.push({ ...br, coord_type_issue: issues.join("; ") });
        }

        // ---- Check 2: Non-numeric depth ----
        const topRaw = row[config.upperDepthCol];
        const botRaw = row[config.lowerDepthCol];
        const topNonNum = isNonEmpty(topRaw) && topNums[i] === null;
        const botNonNum = isNonEmpty(botRaw) && botNums[i] === null;
        if (topNonNum || botNonNum) {
            const issues: string[] = [];
            if (topNonNum) issues.push("top_not_numeric");
            if (botNonNum) issues.push("bottom_not_numeric");
            results.non_numeric_depth_df.push({ ...br, depth_type_issue: issues.join("; ") });
        }

        // ---- Check 5: Missing/invalid coordinates (EPSG:4326) ----
        const xn = xNums[i];
        const yn = yNums[i];
        const lonMissing = xn === null;
        const latMissing = yn === null;
        const lonBad = !lonMissing && (xn! < -180 || xn! > 180);
        const latBad = !latMissing && (yn! < -90 || yn! > 90);
        if (lonMissing || latMissing || lonBad || latBad) {
            const issues: string[] = [];
            if (lonMissing) issues.push("missing_lon");
            if (latMissing) issues.push("missing_lat");
            if (lonBad) issues.push("lon_out_of_range");
            if (latBad) issues.push("lat_out_of_range");
            results.missing_coords_df.push({ ...br, coord_issue: issues.join("; ") });
        }

        // ---- Check 6: Missing depth ----
        if (topNums[i] === null || botNums[i] === null) {
            results.missing_depth_df.push(br);
        }

        // ---- Check 7: Bad depth (bottom <= top) ----
        if (topNums[i] !== null && botNums[i] !== null && botNums[i]! <= topNums[i]!) {
            results.bad_depth_df.push(br);
        }

        // ---- Check 8: Invalid dates ----
        if (config.useDate && config.dateCol) {
            const dateVal = row[config.dateCol];
            if (isNonEmpty(dateVal)) {
                const s = String(dateVal).trim();
                let valid = false;
                if (/^\d{4}$/.test(s)) valid = true;
                else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) valid = true;
                else {
                    const d = new Date(s);
                    valid = !isNaN(d.getTime());
                }
                if (!valid) {
                    results.invalid_dates_df.push({ ...br, date_value: dateVal });
                }
            }
        }

        // ---- Check 9: Invalid profile_code format ----
        if (config.useProfileCode && config.profileCodeCol) {
            const pc = row[config.profileCodeCol] || "";
            if (pc && !/\d+$/.test(pc)) {
                results.invalid_profile_code_df.push({ ...br, profile_code: pc });
            }
        }

        // ---- Check 11: Invalid plot_code format ----
        if (config.usePlotCode && config.plotCodeCol) {
            const pc = row[config.plotCodeCol] || "";
            if (pc && !/\d+$/.test(pc)) {
                results.invalid_plot_code_df.push({ ...br, plot_code: pc });
            }
        }
    }

    // ---- Check 3: Non-numeric soil properties ----
    for (const prop of config.selectedProps) {
        for (let i = 0; i < rows.length; i++) {
            const val = rows[i][prop];
            if (isNonEmpty(val) && numify(val) === null) {
                results.non_numeric_props_df.push({
                    ...baseRow(rows[i], i, config),
                    soil_property: prop,
                    value: val,
                });
            }
        }
    }

    // ---- Check 4: Duplicate sample IDs ----
    const texids = rows.map((r) => (r[config.sampleIdCol] || "").trim());
    const seen = new Map<string, number[]>();
    texids.forEach((t, i) => {
        if (!t) return;
        if (!seen.has(t)) seen.set(t, []);
        seen.get(t)!.push(i);
    });
    for (const [, indices] of seen) {
        if (indices.length > 1) {
            for (const i of indices) {
                results.duplicates_df.push(baseRow(rows[i], i, config));
            }
        }
    }

    // ---- Check 10: Inconsistent profile_code per coordinate group ----
    if (config.useProfileCode && config.profileCodeCol) {
        const coordProfiles = new Map<string, Set<string>>();
        const coordRows = new Map<string, number[]>();
        for (let i = 0; i < rows.length; i++) {
            const key = (rows[i][config.longitudeCol] || "") + "|" + (rows[i][config.latitudeCol] || "");
            const pc = rows[i][config.profileCodeCol!] || "";
            if (!coordProfiles.has(key)) { coordProfiles.set(key, new Set()); coordRows.set(key, []); }
            coordProfiles.get(key)!.add(pc);
            coordRows.get(key)!.push(i);
        }
        for (const [key, profiles] of coordProfiles) {
            if (profiles.size > 1) {
                for (const i of coordRows.get(key)!) {
                    results.profile_inconsistent_df.push({
                        ...baseRow(rows[i], i, config),
                        profile_code: rows[i][config.profileCodeCol!] || "",
                    });
                }
            }
        }
    }

    // ---- Check 12: Inconsistent plot_code per coordinate group ----
    if (config.usePlotCode && config.plotCodeCol) {
        const coordPlots = new Map<string, Set<string>>();
        const coordRows = new Map<string, number[]>();
        for (let i = 0; i < rows.length; i++) {
            const key = (rows[i][config.longitudeCol] || "") + "|" + (rows[i][config.latitudeCol] || "");
            const pc = rows[i][config.plotCodeCol!] || "";
            if (!coordPlots.has(key)) { coordPlots.set(key, new Set()); coordRows.set(key, []); }
            coordPlots.get(key)!.add(pc);
            coordRows.get(key)!.push(i);
        }
        for (const [key, plots] of coordPlots) {
            if (plots.size > 1) {
                for (const i of coordRows.get(key)!) {
                    results.plot_inconsistent_df.push({
                        ...baseRow(rows[i], i, config),
                        plot_code: rows[i][config.plotCodeCol!] || "",
                    });
                }
            }
        }
    }

    // ---- Check 13: Out-of-range soil property values ----
    for (const mapping of config.propertyMappings) {
        const proc = procedures.find(
            (p) =>
                p.property_phys_chem_id === mapping.propertyId &&
                p.procedure_phys_chem_id === mapping.procedureId
        ) || procedures.find((p) => p.property_phys_chem_id === mapping.propertyId);

        if (!proc) continue;

        const vmin = numify(proc.value_min);
        const vmax = numify(proc.value_max);
        if (vmin === null && vmax === null) continue;

        const factor = getConversionFactor(
            procedures, mapping.propertyId, mapping.procedureId, mapping.inputUnit
        );
        const refUnit = getReferenceUnit(procedures, mapping.propertyId, mapping.procedureId);

        for (let i = 0; i < rows.length; i++) {
            const raw = numify(rows[i][mapping.columnName]);
            if (raw === null) continue;
            const converted = raw * factor;

            const belowMin = vmin !== null && converted < vmin;
            const aboveMax = vmax !== null && converted > vmax;
            if (belowMin || aboveMax) {
                results.out_of_range_df.push({
                    ...baseRow(rows[i], i, config),
                    soil_property: mapping.columnName,
                    value_original: raw,
                    value_converted: Math.round(converted * 1000) / 1000,
                    value_min: vmin,
                    value_max: vmax,
                    property_phys_chem_id: mapping.propertyId,
                    procedure_phys_chem_id: mapping.procedureId,
                    unit_of_measure_id: refUnit || mapping.inputUnit,
                });
            }
        }
    }

    return results;
}

/** Summary counts for UI display */
export function qcSummary(results: QCResults): { label: string; count: number }[] {
    return [
        { label: "Non-numeric coordinates (lon/lat)", count: results.non_numeric_coords_df.length },
        { label: "Non-numeric depth (top/bottom)", count: results.non_numeric_depth_df.length },
        { label: "Non-numeric soil properties", count: results.non_numeric_props_df.length },
        { label: "Duplicates (by sample ID)", count: results.duplicates_df.length },
        { label: "Missing/invalid coordinates (EPSG:4326)", count: results.missing_coords_df.length },
        { label: "Missing depth (top OR bottom)", count: results.missing_depth_df.length },
        { label: "Invalid depth (bottom ≤ top)", count: results.bad_depth_df.length },
        { label: "Invalid dates", count: results.invalid_dates_df.length },
        { label: "Invalid profile_code format", count: results.invalid_profile_code_df.length },
        { label: "Inconsistent profile_code per coordinate", count: results.profile_inconsistent_df.length },
        { label: "Invalid plot_code format", count: results.invalid_plot_code_df.length },
        { label: "Inconsistent plot_code per coordinate", count: results.plot_inconsistent_df.length },
        { label: "Out-of-range soil property values", count: results.out_of_range_df.length },
    ];
}
