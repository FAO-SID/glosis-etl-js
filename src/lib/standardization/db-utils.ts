// =============================================================================
// DB-UTILS.TS — Database management utilities
// Port of global.R Sections 4-6
// =============================================================================

import { Pool, PoolClient } from "pg";

// ── Robust error message extraction ──
function errMsg(error: unknown): string {
    if (error instanceof Error) {
        // pg errors often have a 'code' property (e.g. ECONNREFUSED)
        const pgErr = error as Error & { code?: string };
        if (pgErr.code === 'ECONNREFUSED') {
            return `Cannot connect to PostgreSQL at ${getAdminConfig().host}:${getAdminConfig().port}. Is Docker running?`;
        }
        return error.message || String(error);
    }
    return String(error) || "Unknown error";
}

// ── Credentials from environment ──
export function getAdminConfig() {
    return {
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "5442"),
        database: "postgres",
        user: process.env.DB_USER || "glosis",
        password: process.env.DB_PASSWORD || "glosis",
    };
}

export function getDbConfig(dbName: string) {
    return {
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "5442"),
        database: dbName,
        user: process.env.DB_USER || "glosis",
        password: process.env.DB_PASSWORD || "glosis",
    };
}

// SQL schema URL
const SQL_FILE_URL =
    "https://raw.githubusercontent.com/FAO-SID/GloSIS/refs/heads/main/glosis-db/versions/glosis-db_latest.sql";

// ── SQL value escaping (port of R sql_value) ──
export function sqlValue(x: unknown, isNumeric = false): string {
    if (x === null || x === undefined || x === "" || (typeof x === "number" && isNaN(x))) {
        return "NULL";
    }
    if (isNumeric) {
        return String(x);
    }
    return `'${String(x).replace(/'/g, "''")}'`;
}

// ── List all databases ──
export async function listDatabases(): Promise<string[]> {
    const pool = new Pool(getAdminConfig());
    try {
        const result = await pool.query(
            "SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres' ORDER BY datname"
        );
        return result.rows.map((r: { datname: string }) => r.datname);
    } catch (error) {
        console.error("[listDatabases] Error:", error);
        throw new Error(errMsg(error));
    } finally {
        await pool.end();
    }
}

// ── Create database + schema ──
export async function createDatabase(dbName: string): Promise<{ success: boolean; message: string }> {
    const adminPool = new Pool(getAdminConfig());
    try {
        // Check if DB exists
        const exists = await adminPool.query(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            [dbName]
        );

        let isNew = false;
        if (exists.rows.length === 0) {
            // Create database (cannot use parameterized query for DDL)
            const safeName = dbName.replace(/[^a-zA-Z0-9_-]/g, "");
            await adminPool.query(`CREATE DATABASE "${safeName}"`);
            isNew = true;
        }

        // Ensure roles exist
        await adminPool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'glosis') THEN
          CREATE ROLE glosis LOGIN PASSWORD 'glosis';
        END IF;
      END $$;
    `);
        await adminPool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'glosis_r') THEN
          CREATE ROLE glosis_r LOGIN PASSWORD 'glosis';
        END IF;
      END $$;
    `);

        await adminPool.end();

        // Connect to the new DB and enable PostGIS
        const dbPool = new Pool(getDbConfig(dbName));
        try {
            await dbPool.query("CREATE EXTENSION IF NOT EXISTS postgis;");
        } finally {
            await dbPool.end();
        }

        // Download and execute the SQL schema via psql
        const schemaApplied = await applySchema(dbName);
        if (!schemaApplied) {
            return { success: false, message: "Failed to apply schema SQL. Is psql installed?" };
        }

        return {
            success: true,
            message: isNew
                ? `Database '${dbName}' created with GloSIS schema.`
                : `Database '${dbName}' already exists. Schema refreshed.`,
        };
    } catch (error) {
        console.error("[createDatabase] Error:", error);
        return { success: false, message: errMsg(error) };
    } finally {
        try { await adminPool.end(); } catch { /* ignore */ }
    }
}

// ── Apply GloSIS SQL schema using pg client ──
// Handles pg_dump format: COPY blocks, OWNER statements, $$ blocks
async function applySchema(dbName: string): Promise<boolean> {
    try {
        // Step 1: Download the SQL file
        console.log("[applySchema] Downloading SQL schema from GitHub...");
        const response = await fetch(SQL_FILE_URL);
        if (!response.ok) {
            console.error(`[applySchema] Failed to download: ${response.statusText}`);
            return false;
        }
        const sqlContent = await response.text();
        console.log(`[applySchema] Downloaded (${sqlContent.length} bytes, ${sqlContent.split("\n").length} lines)`);

        // Step 2: Parse into executable statements
        const statements = parsePgDump(sqlContent);
        console.log(`[applySchema] Parsed into ${statements.length} statements`);

        // Step 3: Execute each statement
        const pool = new Pool(getDbConfig(dbName));
        let executed = 0;
        let skipped = 0;
        const errors: string[] = [];

        try {
            for (let i = 0; i < statements.length; i++) {
                const stmt = statements[i];
                try {
                    await pool.query(stmt);
                    executed++;
                } catch (stmtErr) {
                    const msg = stmtErr instanceof Error ? stmtErr.message : String(stmtErr);
                    // Skip non-critical errors
                    if (
                        msg.includes("already exists") ||
                        msg.includes("duplicate") ||
                        msg.includes("multiple primary keys") ||
                        msg.includes("must be owner") ||
                        msg.includes("permission denied") ||
                        msg.includes("does not exist")
                    ) {
                        skipped++;
                    } else {
                        // Log first 5 real errors for debugging
                        if (errors.length < 5) {
                            errors.push(`Stmt #${i}: ${msg.slice(0, 150)}`);
                        }
                        skipped++;
                    }
                }
            }
        } finally {
            await pool.end();
        }

        if (errors.length > 0) {
            console.warn(`[applySchema] Sample errors:\n  ${errors.join("\n  ")}`);
        }
        console.log(`[applySchema] ✅ Done: ${executed} executed, ${skipped} skipped`);
        return executed > 0;
    } catch (error) {
        console.error("[applySchema] Error:", error instanceof Error ? error.message : String(error));
        return false;
    }
}

// ── Parse a pg_dump SQL file into executable statements ──
// Handles: COPY..FROM stdin blocks (converts to INSERTs), $$ blocks, skips OWNER TO
function parsePgDump(sql: string): string[] {
    const statements: string[] = [];
    const lines = sql.split("\n");
    let current = "";
    let inDollarQuote = false;
    let dollarTag = "";
    let inCopy = false;
    let copyTable = "";
    let copyColumns: string[] = [];

    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const trimmed = line.trim();

        // ── Handle COPY ... FROM stdin blocks ──
        if (inCopy) {
            if (trimmed === "\\.") {
                // End of COPY block
                inCopy = false;
                copyTable = "";
                copyColumns = [];
                continue;
            }
            // Convert each data line into an INSERT
            const values = line.split("\t");
            const escapedValues = values.map((v) => {
                if (v === "\\N") return "NULL";
                // Escape single quotes and wrap in quotes
                const escaped = v.replace(/'/g, "''");
                return `'${escaped}'`;
            });
            const insertStmt = `INSERT INTO ${copyTable} (${copyColumns.join(", ")}) VALUES (${escapedValues.join(", ")}) ON CONFLICT DO NOTHING;`;
            statements.push(insertStmt);
            continue;
        }

        // ── Detect start of COPY block ──
        if (trimmed.startsWith("COPY ") && trimmed.includes("FROM stdin")) {
            // Parse: COPY schema.table (col1, col2, ...) FROM stdin;
            const match = trimmed.match(/^COPY\s+([\w.]+)\s*\(([^)]+)\)\s+FROM\s+stdin/i);
            if (match) {
                inCopy = true;
                copyTable = match[1];
                copyColumns = match[2].split(",").map((c) => c.trim());
            }
            continue;
        }

        // ── Skip lines we don't need ──
        if (trimmed === "" || trimmed.startsWith("--")) continue;

        // Skip OWNER TO statements (role may not exist)
        if (/ALTER\s+\w+\s+[\w."]+\s+OWNER\s+TO/i.test(trimmed)) continue;

        // Skip GRANT/REVOKE statements
        if (/^(GRANT|REVOKE)\s/i.test(trimmed)) continue;

        // Skip SELECT pg_catalog.set_config
        if (trimmed.startsWith("SELECT pg_catalog.set_config")) continue;

        // ── Track $$ or $tag$ dollar-quoting ──
        const dollarMatches = line.match(/\$([a-zA-Z_]*)\$/g);
        if (dollarMatches) {
            for (const match of dollarMatches) {
                if (!inDollarQuote) {
                    inDollarQuote = true;
                    dollarTag = match;
                } else if (match === dollarTag) {
                    inDollarQuote = false;
                    dollarTag = "";
                }
            }
        }

        current += line + "\n";

        // ── Statement boundary: semicolon outside $$ block ──
        if (!inDollarQuote && trimmed.endsWith(";")) {
            const stmt = current.trim();
            if (stmt) {
                // Remove pure comment-only statements
                const codeLines = stmt.split("\n").filter((l) => {
                    const t = l.trim();
                    return t !== "" && !t.startsWith("--");
                });
                if (codeLines.length > 0) {
                    statements.push(stmt);
                }
            }
            current = "";
        }
    }

    return statements;
}

// ── Delete database ──
export async function deleteDatabase(dbName: string): Promise<{ success: boolean; message: string }> {
    const adminPool = new Pool(getAdminConfig());
    try {
        // Terminate all active connections
        await adminPool.query(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
            [dbName]
        );

        // Drop the database
        const safeName = dbName.replace(/[^a-zA-Z0-9_-]/g, "");
        await adminPool.query(`DROP DATABASE IF EXISTS "${safeName}"`);

        return { success: true, message: `Database '${dbName}' deleted.` };
    } catch (error) {
        console.error("[deleteDatabase] Error:", error);
        return { success: false, message: errMsg(error) };
    } finally {
        await adminPool.end();
    }
}

// ── Test connection and return table count ──
export async function testConnection(dbName: string): Promise<{ connected: boolean; tables: number; message: string }> {
    const pool = new Pool(getDbConfig(dbName));
    try {
        const result = await pool.query(
            "SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema IN ('core', 'metadata')"
        );
        const count = parseInt(result.rows[0].cnt);
        return { connected: true, tables: count, message: `Connected. ${count} tables found.` };
    } catch (error) {
        console.error("[testConnection] Error:", error);
        return { connected: false, tables: 0, message: errMsg(error) };
    } finally {
        await pool.end();
    }
}

// ── Query a schema.table ──
export async function queryTable(
    dbName: string,
    schema: string,
    table: string,
    limit = 500
): Promise<{ columns: string[]; rows: Record<string, unknown>[]; total: number }> {
    const pool = new Pool(getDbConfig(dbName));
    try {
        // Validate schema/table names (prevent injection)
        const safeSchema = schema.replace(/[^a-zA-Z0-9_]/g, "");
        const safeTable = table.replace(/[^a-zA-Z0-9_]/g, "");

        const countResult = await pool.query(
            `SELECT COUNT(*) as cnt FROM "${safeSchema}"."${safeTable}"`
        );
        const total = parseInt(countResult.rows[0].cnt);

        const dataResult = await pool.query(
            `SELECT * FROM "${safeSchema}"."${safeTable}" LIMIT $1`,
            [limit]
        );

        const columns = dataResult.fields.map((f) => f.name);
        return { columns, rows: dataResult.rows, total };
    } finally {
        await pool.end();
    }
}
