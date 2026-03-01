// Databases API — List, Create, Delete
import { NextResponse } from "next/server";
import { listDatabases, createDatabase, deleteDatabase } from "@/lib/standardization/db-utils";

function errMsg(e: unknown): string {
    if (e instanceof Error) return e.message || String(e);
    return String(e) || "Unknown error";
}

// GET /api/databases — List all databases
export async function GET() {
    try {
        const databases = await listDatabases();
        return NextResponse.json({ databases });
    } catch (error) {
        console.error("[GET /api/databases]", error);
        return NextResponse.json({ error: errMsg(error) }, { status: 500 });
    }
}

// POST /api/databases — Create a new database
export async function POST(request: Request) {
    try {
        const { name } = await request.json();
        if (!name || typeof name !== "string") {
            return NextResponse.json({ error: "Database name is required" }, { status: 400 });
        }
        const result = await createDatabase(name.trim());
        return NextResponse.json(result, { status: result.success ? 200 : 500 });
    } catch (error) {
        console.error("[POST /api/databases]", error);
        return NextResponse.json({ success: false, message: errMsg(error) }, { status: 500 });
    }
}

// DELETE /api/databases — Delete a database
export async function DELETE(request: Request) {
    try {
        const { name } = await request.json();
        if (!name || typeof name !== "string") {
            return NextResponse.json({ error: "Database name is required" }, { status: 400 });
        }
        const result = await deleteDatabase(name.trim());
        return NextResponse.json(result, { status: result.success ? 200 : 500 });
    } catch (error) {
        console.error("[DELETE /api/databases]", error);
        return NextResponse.json({ success: false, message: errMsg(error) }, { status: 500 });
    }
}
