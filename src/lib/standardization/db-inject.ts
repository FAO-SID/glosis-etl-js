// =============================================================================
// DB-INJECT.TS — Port of fill_tables.R
// Injects harmonized XLSX data into GloSIS ISO-28258 PostgreSQL database
// =============================================================================

import { Pool, PoolClient } from "pg";
import { sqlValue, getDbConfig } from "./db-utils";
import {
    PLOT_DESC_PROPERTIES,
    PROFILE_DESC_PROPERTIES,
    ELEMENT_DESC_PROPERTIES,
} from "./table-definitions";

/** Row from the "Plot Data" XLSX sheet */
type PlotRow = Record<string, string | number | null>;
/** Row from the "Procedures" XLSX sheet */
type ProcedureRow = { property_phys_chem_id: string; procedure_phys_chem_id: string; unit_of_measure_id: string };

export interface InjectionResult {
    success: boolean;
    message: string;
    errors: string[];
    counts: Record<string, number>;
}

// ── Main injection entry point ──
export async function injectData(
    dbName: string,
    plotData: PlotRow[],
    procedures: ProcedureRow[]
): Promise<InjectionResult> {
    const pool = new Pool(getDbConfig(dbName));
    const client = await pool.connect();
    const errors: string[] = [];
    const counts: Record<string, number> = {};

    try {
        // Pre-flight: verify required tables exist
        const tableCheck = await client.query(
            `SELECT table_schema || '.' || table_name as tbl
             FROM information_schema.tables
             WHERE table_schema IN ('core', 'metadata')
             ORDER BY tbl`
        );
        const existingTables = tableCheck.rows.map((r: { tbl: string }) => r.tbl);
        console.log(`[injectData] Found ${existingTables.length} tables in DB`);

        if (!existingTables.includes("metadata.address") || !existingTables.includes("core.project")) {
            return {
                success: false,
                message: `Schema not applied — found ${existingTables.length} tables but required tables (metadata.address, core.project) are missing. Try deleting and recreating the database.`,
                errors: [`Missing tables. Found: ${existingTables.join(", ")}`],
                counts,
            };
        }

        console.log(`[injectData] Received ${plotData.length} data rows, ${procedures.length} procedures`);
        if (plotData.length > 0) {
            const keys = Object.keys(plotData[0]);
            console.log(`[injectData] Column names (${keys.length}):`, keys.slice(0, 20).join(", "));
            console.log(`[injectData] Sample project_name:`, plotData[0].project_name, "| site_code:", plotData[0].site_code, "| plot_code:", plotData[0].plot_code);
        }

        // Each section runs independently (like the R version's tryCatch blocks)
        // No wrapping transaction — a failure in one section doesn't block others

        // 1. Metadata
        try { counts.metadata = await insertMetadata(client, plotData, errors); }
        catch (e) { errors.push(`Metadata section failed: ${e instanceof Error ? e.message : String(e)}`); counts.metadata = 0; }

        // 2. Project
        try { counts.project = await insertProjects(client, plotData, errors); }
        catch (e) { errors.push(`Project section failed: ${e instanceof Error ? e.message : String(e)}`); counts.project = 0; }

        // 3. Site
        try { counts.site = await insertSites(client, plotData, errors); }
        catch (e) { errors.push(`Site section failed: ${e instanceof Error ? e.message : String(e)}`); counts.site = 0; }

        // 4. Project-Site
        try { counts.project_site = await insertProjectSite(client, plotData, errors); }
        catch (e) { errors.push(`ProjectSite section failed: ${e instanceof Error ? e.message : String(e)}`); counts.project_site = 0; }

        // 5. Plot
        try { counts.plot = await insertPlots(client, plotData, errors); }
        catch (e) { errors.push(`Plot section failed: ${e instanceof Error ? e.message : String(e)}`); counts.plot = 0; }

        // 6. Plot-Individual
        try { counts.plot_individual = await insertPlotIndividual(client, plotData, errors); }
        catch (e) { errors.push(`PlotIndividual section failed: ${e instanceof Error ? e.message : String(e)}`); counts.plot_individual = 0; }

        // 7. Result Desc Plot
        try { counts.result_desc_plot = await insertResultDescPlot(client, plotData, errors); }
        catch (e) { errors.push(`ResultDescPlot section failed: ${e instanceof Error ? e.message : String(e)}`); counts.result_desc_plot = 0; }

        // 8. Profile
        try { counts.profile = await insertProfiles(client, plotData, errors); }
        catch (e) { errors.push(`Profile section failed: ${e instanceof Error ? e.message : String(e)}`); counts.profile = 0; }

        // 9. Result Desc Profile
        try { counts.result_desc_profile = await insertResultDescProfile(client, plotData, errors); }
        catch (e) { errors.push(`ResultDescProfile section failed: ${e instanceof Error ? e.message : String(e)}`); counts.result_desc_profile = 0; }

        // 10. Element
        try { counts.element = await insertElements(client, plotData, errors); }
        catch (e) { errors.push(`Element section failed: ${e instanceof Error ? e.message : String(e)}`); counts.element = 0; }

        // 11. Result Desc Element
        try { counts.result_desc_element = await insertResultDescElement(client, plotData, errors); }
        catch (e) { errors.push(`ResultDescElement section failed: ${e instanceof Error ? e.message : String(e)}`); counts.result_desc_element = 0; }

        // 12. Specimen
        try { counts.specimen = await insertSpecimens(client, plotData, errors); }
        catch (e) { errors.push(`Specimen section failed: ${e instanceof Error ? e.message : String(e)}`); counts.specimen = 0; }

        // 13. Result Phys Chem
        try { counts.result_phys_chem = await insertResultPhysChem(client, plotData, procedures, errors); }
        catch (e) { errors.push(`ResultPhysChem section failed: ${e instanceof Error ? e.message : String(e)}`); counts.result_phys_chem = 0; }

        return {
            success: true,
            message: "Data injected successfully.",
            errors,
            counts,
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, message: `Injection failed: ${msg}`, errors: [...errors, msg], counts };
    } finally {
        client.release();
        await pool.end();
    }
}

// ── Helper: get unique rows by specific keys ──
function unique<T extends Record<string, unknown>>(rows: T[], keys: string[]): T[] {
    const seen = new Set<string>();
    return rows.filter((row) => {
        const key = keys.map((k) => String(row[k] ?? "")).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ── Helper: safely get string or null ──
function str(v: unknown): string | null {
    if (v === null || v === undefined || v === "") return null;
    return String(v);
}
function num(v: unknown): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
}

// ═════════════════════════════════════════════════════════════
// 1. METADATA
// ═════════════════════════════════════════════════════════════
async function insertMetadata(client: PoolClient, rows: PlotRow[], errors: string[]): Promise<number> {
    let count = 0;
    const metaKeys = ["name", "honorific_title", "role", "email", "telephone", "url", "organization", "street_address", "postal_code", "locality", "country"];
    const uniqueRows = unique(rows, metaKeys);

    for (const row of uniqueRows) {
        try {
            // 1. Address
            let addressId: number;
            const addrRes = await client.query(
                `SELECT address_id FROM metadata.address WHERE street_address = $1 AND postal_code = $2 AND locality = $3 AND country = $4`,
                [str(row.street_address), str(row.postal_code), str(row.locality), str(row.country)]
            );
            if (addrRes.rows.length === 0) {
                const ins = await client.query(
                    `INSERT INTO metadata.address (street_address, postal_code, locality, country) VALUES ($1, $2, $3, $4) RETURNING address_id`,
                    [str(row.street_address), str(row.postal_code), str(row.locality), str(row.country)]
                );
                addressId = ins.rows[0].address_id;
            } else {
                addressId = addrRes.rows[0].address_id;
            }

            // 2. Organisation
            let organisationId: number | null = null;
            if (str(row.organization)) {
                const orgRes = await client.query(
                    `SELECT organisation_id FROM metadata.organisation WHERE name = $1`, [str(row.organization)]
                );
                if (orgRes.rows.length === 0) {
                    const ins = await client.query(
                        `INSERT INTO metadata.organisation (name, address_id) VALUES ($1, $2) RETURNING organisation_id`,
                        [str(row.organization), addressId]
                    );
                    organisationId = ins.rows[0].organisation_id;
                } else {
                    organisationId = orgRes.rows[0].organisation_id;
                }
            }

            // 3. Organisation Unit
            let organisationUnitId: number | null = null;
            if (organisationId !== null) {
                const unitRes = await client.query(
                    `SELECT organisation_unit_id FROM metadata.organisation_unit WHERE name = $1 AND organisation_id = $2`,
                    [str(row.organization), organisationId]
                );
                if (unitRes.rows.length === 0) {
                    const ins = await client.query(
                        `INSERT INTO metadata.organisation_unit (name, organisation_id) VALUES ($1, $2) RETURNING organisation_unit_id`,
                        [str(row.organization), organisationId]
                    );
                    organisationUnitId = ins.rows[0].organisation_unit_id;
                } else {
                    organisationUnitId = unitRes.rows[0].organisation_unit_id;
                }
            }

            // 4. Individual
            let individualId: number;
            const indivRes = await client.query(
                `SELECT individual_id FROM metadata.individual WHERE name = $1 AND email = $2`,
                [str(row.name), str(row.email)]
            );
            if (indivRes.rows.length === 0) {
                const ins = await client.query(
                    `INSERT INTO metadata.individual (name, honorific_title, email, telephone, url, address_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING individual_id`,
                    [str(row.name), str(row.honorific_title), str(row.email), str(row.telephone), str(row.url), addressId]
                );
                individualId = ins.rows[0].individual_id;
            } else {
                individualId = indivRes.rows[0].individual_id;
            }

            // 5. Link individual to organisation
            if (organisationId !== null && organisationUnitId !== null) {
                const linkRes = await client.query(
                    `SELECT 1 FROM metadata.organisation_individual WHERE organisation_id = $1 AND individual_id = $2 AND organisation_unit_id = $3`,
                    [organisationId, individualId, organisationUnitId]
                );
                if (linkRes.rows.length === 0) {
                    await client.query(
                        `INSERT INTO metadata.organisation_individual (organisation_id, individual_id, organisation_unit_id, role) VALUES ($1, $2, $3, $4)`,
                        [organisationId, individualId, organisationUnitId, str(row.role)]
                    );
                }
            }
            count++;
        } catch (e) {
            errors.push(`Metadata: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    return count;
}

// ═════════════════════════════════════════════════════════════
// 2. PROJECT
// ═════════════════════════════════════════════════════════════
async function insertProjects(client: PoolClient, rows: PlotRow[], errors: string[]): Promise<number> {
    let count = 0;
    const uniqueNames = [...new Set(rows.map((r) => str(r.project_name)).filter(Boolean))];
    for (const name of uniqueNames) {
        try {
            await client.query(
                `INSERT INTO core.project (project_id, name) VALUES (DEFAULT, $1) ON CONFLICT DO NOTHING`, [name]
            );
            count++;
        } catch (e) {
            errors.push(`Project: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    // Cleanup duplicates
    await client.query(
        `DELETE FROM core.project a USING core.project b WHERE b.project_id < a.project_id AND a.name = b.name`
    );
    return count;
}

// ═════════════════════════════════════════════════════════════
// 3. SITE
// ═════════════════════════════════════════════════════════════
async function insertSites(client: PoolClient, rows: PlotRow[], errors: string[]): Promise<number> {
    let count = 0;
    const uniqueRows = unique(rows, ["site_code", "latitude", "longitude", "extent"]);
    for (const row of uniqueRows) {
        try {
            const position = `POINT(${num(row.longitude)} ${num(row.latitude)})`;
            await client.query(
                `INSERT INTO core.site (site_code, position, extent)
         VALUES ($1, ST_GeomFromText($2, 4326), $3)
         ON CONFLICT (site_code) DO NOTHING`,
                [str(row.site_code), position, num(row.extent)]
            );
            count++;
        } catch (e) {
            errors.push(`Site: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    await client.query(
        `DELETE FROM core.site a USING core.site b WHERE b.site_id < a.site_id AND a.site_code = b.site_code AND a.position = b.position`
    );
    return count;
}

// ═════════════════════════════════════════════════════════════
// 4. PROJECT_SITE
// ═════════════════════════════════════════════════════════════
async function insertProjectSite(client: PoolClient, rows: PlotRow[], errors: string[]): Promise<number> {
    let count = 0;
    const uniqueRows = unique(rows, ["site_code", "project_name"]);
    for (const row of uniqueRows) {
        try {
            const siteRes = await client.query(`SELECT site_id FROM core.site WHERE site_code = $1`, [str(row.site_code)]);
            const projRes = await client.query(`SELECT project_id FROM core.project WHERE name = $1`, [str(row.project_name)]);
            if (siteRes.rows.length > 0 && projRes.rows.length > 0) {
                await client.query(
                    `INSERT INTO core.project_site (site_id, project_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [siteRes.rows[0].site_id, projRes.rows[0].project_id]
                );
                count++;
            }
        } catch (e) {
            errors.push(`ProjectSite: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    return count;
}

// ═════════════════════════════════════════════════════════════
// 5. PLOT
// ═════════════════════════════════════════════════════════════
async function insertPlots(client: PoolClient, rows: PlotRow[], errors: string[]): Promise<number> {
    let count = 0;
    const uniqueRows = unique(rows, ["site_code", "project_name", "plot_code", "date", "map_sheet_code", "altitude", "positional_accuracy", "longitude", "latitude", "plot_type"]);
    for (const row of uniqueRows) {
        try {
            const siteRes = await client.query(`SELECT site_id FROM core.site WHERE site_code = $1`, [str(row.site_code)]);
            const projRes = await client.query(`SELECT project_id FROM core.project WHERE name = $1`, [str(row.project_name)]);
            if (siteRes.rows.length === 0 || projRes.rows.length === 0) continue;

            const siteId = siteRes.rows[0].site_id;
            const projectId = projRes.rows[0].project_id;
            const position = `POINT(${num(row.longitude)} ${num(row.latitude)})`;

            // Check if plot exists
            const existing = await client.query(`SELECT plot_id FROM core.plot WHERE plot_code = $1`, [str(row.plot_code)]);
            if (existing.rows.length === 0) {
                await client.query(
                    `INSERT INTO core.plot (plot_code, site_id, altitude, time_stamp, map_sheet_code, positional_accuracy, position, type)
           VALUES ($1, $2, $3, $4, $5, $6, ST_GeomFromText($7, 4326), $8)`,
                    [str(row.plot_code), siteId, num(row.altitude), str(row.date), str(row.map_sheet_code), num(row.positional_accuracy), position, str(row.plot_type)]
                );
                count++;
            }

            // Ensure project_site
            await client.query(
                `INSERT INTO core.project_site (site_id, project_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [siteId, projectId]
            );
        } catch (e) {
            errors.push(`Plot: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    return count;
}

// ═════════════════════════════════════════════════════════════
// 6. PLOT-INDIVIDUAL
// ═════════════════════════════════════════════════════════════
async function insertPlotIndividual(client: PoolClient, rows: PlotRow[], errors: string[]): Promise<number> {
    let count = 0;
    const uniqueRows = unique(rows, ["plot_code", "name", "email"]);
    for (const row of uniqueRows) {
        try {
            const safeName = str(row.name) || "";
            const safeEmail = str(row.email) || "";
            const indivRes = await client.query(
                `SELECT individual_id FROM metadata.individual WHERE COALESCE(name, '') = $1 AND COALESCE(email, '') = $2`,
                [safeName, safeEmail]
            );
            if (indivRes.rows.length === 0) continue;
            const individualId = indivRes.rows[0].individual_id;

            const plotRes = await client.query(`SELECT plot_id FROM core.plot WHERE plot_code = $1`, [str(row.plot_code)]);
            if (plotRes.rows.length === 0) continue;
            const plotId = plotRes.rows[0].plot_id;

            const linkRes = await client.query(
                `SELECT 1 FROM core.plot_individual WHERE plot_id = $1 AND individual_id = $2`, [plotId, individualId]
            );
            if (linkRes.rows.length === 0) {
                await client.query(
                    `INSERT INTO core.plot_individual (plot_id, individual_id) VALUES ($1, $2)`, [plotId, individualId]
                );
                count++;
            }
        } catch (e) {
            errors.push(`PlotIndividual: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    return count;
}

// ═════════════════════════════════════════════════════════════
// 7. RESULT DESC PLOT (pivot plot descriptive properties)
// ═════════════════════════════════════════════════════════════
async function insertResultDescPlot(client: PoolClient, rows: PlotRow[], errors: string[]): Promise<number> {
    let count = 0;
    for (const row of rows) {
        for (const prop of PLOT_DESC_PROPERTIES) {
            const val = str(row[prop]);
            if (!val) continue;
            try {
                const plotRes = await client.query(`SELECT plot_id FROM core.plot WHERE plot_code = $1`, [str(row.plot_code)]);
                if (plotRes.rows.length === 0) continue;
                const plotId = plotRes.rows[0].plot_id;

                // Validate combo
                const valid = await client.query(
                    `SELECT 1 FROM core.observation_desc_plot WHERE property_desc_id = $1 AND category_desc_id = $2`,
                    [prop, val]
                );
                if (valid.rows.length === 0) continue;

                await client.query(
                    `INSERT INTO core.result_desc_plot (plot_id, property_desc_id, category_desc_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                    [plotId, prop, val]
                );
                count++;
            } catch (e) {
                errors.push(`ResultDescPlot: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }
    return count;
}

// ═════════════════════════════════════════════════════════════
// 8. PROFILE
// ═════════════════════════════════════════════════════════════
async function insertProfiles(client: PoolClient, rows: PlotRow[], errors: string[]): Promise<number> {
    let count = 0;
    const uniqueRows = unique(rows, ["plot_code", "profile_code"]);
    for (const row of uniqueRows) {
        try {
            const plotRes = await client.query(`SELECT plot_id FROM core.plot WHERE plot_code = $1`, [str(row.plot_code)]);
            if (plotRes.rows.length === 0) continue;
            const plotId = plotRes.rows[0].plot_id;

            const existing = await client.query(`SELECT profile_id FROM core.profile WHERE profile_code = $1`, [str(row.profile_code)]);
            if (existing.rows.length === 0) {
                await client.query(
                    `INSERT INTO core.profile (plot_id, profile_code) VALUES ($1, $2)`,
                    [plotId, str(row.profile_code)]
                );
                count++;
            }
        } catch (e) {
            errors.push(`Profile: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    return count;
}

// ═════════════════════════════════════════════════════════════
// 9. RESULT DESC PROFILE
// ═════════════════════════════════════════════════════════════
async function insertResultDescProfile(client: PoolClient, rows: PlotRow[], errors: string[]): Promise<number> {
    let count = 0;
    for (const row of rows) {
        for (const prop of PROFILE_DESC_PROPERTIES) {
            const val = str(row[prop]);
            if (!val) continue;
            try {
                const profRes = await client.query(`SELECT profile_id FROM core.profile WHERE profile_code = $1`, [str(row.profile_code)]);
                if (profRes.rows.length === 0) continue;
                const profileId = profRes.rows[0].profile_id;

                await client.query(
                    `INSERT INTO core.result_desc_profile (profile_id, property_desc_id, category_desc_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                    [profileId, prop, val]
                );
                count++;
            } catch (e) {
                errors.push(`ResultDescProfile: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }
    return count;
}

// ═════════════════════════════════════════════════════════════
// 10. ELEMENT
// ═════════════════════════════════════════════════════════════
async function insertElements(client: PoolClient, rows: PlotRow[], errors: string[]): Promise<number> {
    let count = 0;
    const uniqueRows = unique(rows, ["order_element", "type", "upper_depth", "lower_depth", "specimen_code", "profile_code"]);
    for (const row of uniqueRows) {
        try {
            const upperDepth = num(row.upper_depth);
            const lowerDepth = num(row.lower_depth);

            // Validate depths
            if (upperDepth === null || lowerDepth === null) {
                errors.push(`Element: Missing depth for specimen '${row.specimen_code}' (profile: '${row.profile_code}'). Raw values: upper='${row.upper_depth}', lower='${row.lower_depth}'`);
                continue;
            }
            if (upperDepth < 0) {
                errors.push(`Element: Upper depth (${upperDepth}) is negative for specimen '${row.specimen_code}'`);
                continue;
            }
            if (upperDepth >= lowerDepth) {
                errors.push(`Element: Upper depth (${upperDepth}) >= lower depth (${lowerDepth}) for specimen '${row.specimen_code}'`);
                continue;
            }

            const profRes = await client.query(`SELECT profile_id FROM core.profile WHERE profile_code = $1`, [str(row.profile_code)]);
            if (profRes.rows.length === 0) continue;
            const profileId = profRes.rows[0].profile_id;

            await client.query(
                `INSERT INTO core.element (profile_id, order_element, upper_depth, lower_depth, type) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
                [profileId, num(row.order_element), upperDepth, lowerDepth, str(row.type)]
            );
            count++;
        } catch (e) {
            errors.push(`Element: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    return count;
}

// ═════════════════════════════════════════════════════════════
// 11. RESULT DESC ELEMENT
// ═════════════════════════════════════════════════════════════
async function insertResultDescElement(client: PoolClient, rows: PlotRow[], errors: string[]): Promise<number> {
    let count = 0;
    for (const row of rows) {
        for (const prop of ELEMENT_DESC_PROPERTIES) {
            const val = str(row[prop]);
            if (!val) continue;
            try {
                const profRes = await client.query(`SELECT profile_id FROM core.profile WHERE profile_code = $1`, [str(row.profile_code)]);
                if (profRes.rows.length === 0) continue;
                const profileId = profRes.rows[0].profile_id;

                const elemRes = await client.query(
                    `SELECT element_id FROM core.element WHERE profile_id = $1 AND order_element = $2`,
                    [profileId, num(row.order_element)]
                );
                if (elemRes.rows.length === 0) continue;
                const elementId = elemRes.rows[0].element_id;

                // Validate combo
                const valid = await client.query(
                    `SELECT 1 FROM core.observation_desc_element WHERE property_desc_id = $1 AND category_desc_id = $2`,
                    [prop, val]
                );
                if (valid.rows.length === 0) continue;

                await client.query(
                    `INSERT INTO core.result_desc_element (element_id, property_desc_id, category_desc_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                    [elementId, prop, val]
                );
                count++;
            } catch (e) {
                errors.push(`ResultDescElement: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }
    return count;
}

// ═════════════════════════════════════════════════════════════
// 12. SPECIMEN
// ═════════════════════════════════════════════════════════════
async function insertSpecimens(client: PoolClient, rows: PlotRow[], errors: string[]): Promise<number> {
    let count = 0;
    for (const row of rows) {
        try {
            const profRes = await client.query(`SELECT profile_id FROM core.profile WHERE profile_code = $1`, [str(row.profile_code)]);
            if (profRes.rows.length === 0) continue;
            const profileId = profRes.rows[0].profile_id;

            const elemRes = await client.query(
                `SELECT element_id FROM core.element WHERE profile_id = $1 AND order_element = $2`,
                [profileId, num(row.order_element)]
            );
            if (elemRes.rows.length === 0) continue;
            const elementId = elemRes.rows[0].element_id;

            // Organisation (optional)
            let organisationId: number | null = null;
            if (str(row.organization)) {
                const orgRes = await client.query(
                    `SELECT organisation_id FROM metadata.organisation WHERE name = $1`, [str(row.organization)]
                );
                if (orgRes.rows.length > 0) {
                    organisationId = orgRes.rows[0].organisation_id;
                }
            }

            if (organisationId !== null) {
                await client.query(
                    `INSERT INTO core.specimen (element_id, organisation_id, code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                    [elementId, organisationId, str(row.specimen_code)]
                );
            } else {
                await client.query(
                    `INSERT INTO core.specimen (element_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [elementId, str(row.specimen_code)]
                );
            }
            count++;
        } catch (e) {
            errors.push(`Specimen: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    return count;
}

// ═════════════════════════════════════════════════════════════
// 13. RESULT PHYS CHEM
// ═════════════════════════════════════════════════════════════
async function insertResultPhysChem(
    client: PoolClient,
    rows: PlotRow[],
    procedures: ProcedureRow[],
    errors: string[]
): Promise<number> {
    let count = 0;

    // If no procedures from XLSX, auto-detect from the database
    if (procedures.length === 0) {
        console.log("[insertResultPhysChem] No procedures from XLSX, querying DB...");
        try {
            const obsRes = await client.query(
                `SELECT DISTINCT property_phys_chem_id, procedure_phys_chem_id
                 FROM core.observation_phys_chem
                 ORDER BY property_phys_chem_id`
            );
            procedures = obsRes.rows.map((r: { property_phys_chem_id: string; procedure_phys_chem_id: string }) => ({
                property_phys_chem_id: r.property_phys_chem_id,
                procedure_phys_chem_id: r.procedure_phys_chem_id,
                unit_of_measure_id: "",
            }));
            console.log(`[insertResultPhysChem] Found ${procedures.length} observation records in DB`);
        } catch (e) {
            errors.push(`Failed to query observation_phys_chem: ${e instanceof Error ? e.message : String(e)}`);
            return 0;
        }
    }

    // Find which property IDs actually exist as columns in the data
    const dataColumns = new Set<string>();
    for (const row of rows) {
        Object.keys(row).forEach(k => dataColumns.add(k));
    }
    const matchingProcedures = procedures.filter((p) => dataColumns.has(p.property_phys_chem_id));
    console.log(`[insertResultPhysChem] ${matchingProcedures.length} property columns found in data out of ${procedures.length} procedures`);

    if (matchingProcedures.length === 0) {
        // Log available columns for debugging
        const sampleCols = Array.from(dataColumns).slice(0, 20);
        console.log(`[insertResultPhysChem] Available data columns:`, sampleCols);
        const sampleProps = procedures.slice(0, 10).map((p) => p.property_phys_chem_id);
        console.log(`[insertResultPhysChem] Expected property IDs:`, sampleProps);
        errors.push(`No matching property columns found in data. Data has: ${sampleCols.join(", ")}`);
        return 0;
    }

    for (const row of rows) {
        for (const proc of matchingProcedures) {
            const propertyId = proc.property_phys_chem_id;
            const procedureId = proc.procedure_phys_chem_id;
            const rawValue = row[propertyId];
            const value = num(rawValue);
            if (value === null) continue;

            try {
                // 1. Get observation ID and bounds
                const boundsRes = await client.query(
                    `SELECT observation_phys_chem_id, value_min, value_max FROM core.observation_phys_chem
           WHERE property_phys_chem_id = $1 AND procedure_phys_chem_id = $2`,
                    [propertyId, procedureId]
                );
                if (boundsRes.rows.length === 0) continue;

                const observationId = boundsRes.rows[0].observation_phys_chem_id;
                const valueMin = boundsRes.rows[0].value_min;
                const valueMax = boundsRes.rows[0].value_max;

                // 2. Get specimen ID
                const specRes = await client.query(
                    `SELECT specimen_id FROM core.specimen WHERE code = $1`, [str(row.specimen_code)]
                );
                if (specRes.rows.length === 0) continue;
                const specimenId = specRes.rows[0].specimen_id;

                // 3. Get individual_id
                let individualId: number | null = null;
                const safeName = str(row.name) || "";
                const safeEmail = str(row.email) || "";
                const indivRes = await client.query(
                    `SELECT individual_id FROM metadata.individual WHERE COALESCE(name, '') = $1 AND COALESCE(email, '') = $2`,
                    [safeName, safeEmail]
                );
                if (indivRes.rows.length > 0) {
                    individualId = indivRes.rows[0].individual_id;
                }

                // 4. Check bounds
                if ((valueMin !== null && value < valueMin) || (valueMax !== null && value > valueMax)) {
                    errors.push(
                        `Value ${value.toFixed(3)} for '${propertyId}' (specimen: '${row.specimen_code}') outside bounds [${valueMin ?? -Infinity} – ${valueMax ?? Infinity}]`
                    );
                    continue;
                }

                // 5. Insert
                if (individualId !== null) {
                    await client.query(
                        `INSERT INTO core.result_phys_chem (observation_phys_chem_id, specimen_id, individual_id, value)
             VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
                        [observationId, specimenId, individualId, value]
                    );
                } else {
                    await client.query(
                        `INSERT INTO core.result_phys_chem (observation_phys_chem_id, specimen_id, value)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                        [observationId, specimenId, value]
                    );
                }
                count++;
            } catch (e) {
                errors.push(`ResultPhysChem: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }
    return count;
}
