// Query API — Fetch rows from a specific schema.table
import { NextResponse } from "next/server";
import { queryTable } from "@/lib/standardization/db-utils";

export async function POST(request: Request) {
    try {
        const { dbName, schema, table, limit } = await request.json();
        if (!dbName || !schema || !table) {
            return NextResponse.json({ error: "dbName, schema, and table are required" }, { status: 400 });
        }
        const result = await queryTable(dbName, schema, table, limit || 500);
        return NextResponse.json(result);
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: msg, columns: [], rows: [], total: 0 }, { status: 500 });
    }
}
