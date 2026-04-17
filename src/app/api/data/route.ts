import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { QUERY_LOCATION_DATA, QUERY_PROPERTY_DATA } from "@/lib/queries";

export async function GET(request: NextRequest) {
  const dbName = request.nextUrl.searchParams.get("db");
  if (!dbName) {
    return NextResponse.json({ error: "Missing db parameter" }, { status: 400 });
  }

  const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5442"),
    database: dbName,
    user: process.env.DB_USER || "glosis",
    password: process.env.DB_PASSWORD || "glosis",
  });

  try {
    // Query 1: Location data
    const locResult = await pool.query(QUERY_LOCATION_DATA);
    const locations = locResult.rows;

    // Deduplicate and select relevant columns (matching R logic)
    const locationMap = new Map<string, Record<string, unknown>>();
    for (const row of locations) {
      const key = row.code;
      if (!locationMap.has(key)) {
        locationMap.set(key, {
          code: row.code,
          profile_code: row.profile_code,
          element_id: row.element_id,
          type: row.type,
          upper_depth: row.upper_depth,
          lower_depth: row.lower_depth,
          longitude: parseFloat(row.longitude),
          latitude: parseFloat(row.latitude),
        });
      }
    }

    // Query 2: Property data
    const propResult = await pool.query(QUERY_PROPERTY_DATA);
    const properties = propResult.rows;

    // Group by code+property, compute mean value, then pivot
    const propAgg = new Map<string, Map<string, { sum: number; count: number }>>();
    for (const row of properties) {
      const key = row.code;
      if (!propAgg.has(key)) propAgg.set(key, new Map());
      const propMap = propAgg.get(key)!;
      // Append the procedure_phys_chem_id method code and unit_of_measure_id to the property name
      let propId = `${row.property_phys_chem_id} (${row.procedure_phys_chem_id})`;
      if (row.unit_of_measure_id) {
        propId += ` [${row.unit_of_measure_id}]`;
      }
      if (!propMap.has(propId)) propMap.set(propId, { sum: 0, count: 0 });
      const agg = propMap.get(propId)!;
      agg.sum += parseFloat(row.value) || 0;
      agg.count += 1;
    }

    // Also collect project_name and site_code per code
    const metaMap = new Map<string, { project_name: string; site_code: string }>();
    for (const row of properties) {
      if (!metaMap.has(row.code)) {
        metaMap.set(row.code, { project_name: row.project_name, site_code: row.site_code });
      }
    }

    // Join location + properties (pivot wider)
    const allPropIds = new Set<string>();
    for (const [, propMap] of propAgg) {
      for (const propId of propMap.keys()) allPropIds.add(propId);
    }

    const data = [];
    for (const [code, loc] of locationMap) {
      const row: Record<string, unknown> = { ...loc };
      const meta = metaMap.get(code);
      if (meta) {
        row.project_name = meta.project_name;
        row.site_code = meta.site_code;
      }
      const propMap = propAgg.get(code);
      if (propMap) {
        for (const propId of allPropIds) {
          const agg = propMap.get(propId);
          row[propId] = agg ? Math.round((agg.sum / agg.count) * 1000) / 1000 : null;
        }
      }
      data.push(row);
    }

    // Build property list (numeric columns excluding metadata)
    const excludeCols = new Set(["code", "profile_code", "element_id", "type", "upper_depth", "lower_depth", "longitude", "latitude", "project_name", "site_code"]);
    const propertyColumns = Array.from(allPropIds).sort();

    return NextResponse.json({ data, propertyColumns });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await pool.end();
  }
}
