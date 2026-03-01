import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { parseProceduresCSV } from "@/lib/harmonization";

export async function GET() {
  try {
    const filePath = join(process.cwd(), "public", "glosis_procedures_v2.csv");
    const text = await readFile(filePath, "utf-8");
    const procedures = parseProceduresCSV(text);
    return NextResponse.json({ procedures });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
