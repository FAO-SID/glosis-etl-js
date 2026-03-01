// Connect API — Test connection to a database
import { NextResponse } from "next/server";
import { testConnection } from "@/lib/standardization/db-utils";

export async function POST(request: Request) {
    try {
        const { name } = await request.json();
        if (!name || typeof name !== "string") {
            return NextResponse.json({ error: "Database name is required" }, { status: 400 });
        }
        const result = await testConnection(name.trim());
        return NextResponse.json(result);
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ connected: false, tables: 0, message: msg }, { status: 500 });
    }
}
