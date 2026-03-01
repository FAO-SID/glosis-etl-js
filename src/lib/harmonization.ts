/**
 * Harmonization core logic — ported from apps/harmonization/server.R
 */

// ---------- Types ----------

export interface ProcedureRow {
  property_phys_chem_id: string;
  procedure_phys_chem_id: string;
  unit_of_measure_id: string;
  value_min: string;
  value_max: string;
  definition: string;
  common_input_units: string; // semicolon-separated
  conversion_factors: string; // semicolon-separated
  notes: string;
}

export interface PropertyMapping {
  columnName: string;
  propertyId: string;
  procedureId: string;
  inputUnit: string;
}

// ---------- Column auto-detection keywords ----------

export const SOIL_KEYWORDS = [
  "bd", "bulk_density", "soc", "som", "c_tot", "ph", "ph_h2o", "ph_water",
  "clay", "silt", "sand", "ec", "cec", "esp", "sar",
  "n_tot", "p_tot", "p_mehlich", "p_olsen", "p_avail",
  "k_tot", "k_ext", "k_avail",
];

const LON_NAMES = ["X", "x", "lon", "Lon", "LON", "long", "Long", "LONG", "longitude", "Longitude", "LONGITUDE", "xcoord", "easting"];
const LAT_NAMES = ["Y", "y", "lat", "Lat", "LAT", "latitude", "Latitude", "LATITUDE", "ycoord", "northing"];
const TOP_NAMES = ["top", "Top", "TOP", "top_depth", "upper_depth", "Upper_depth", "from", "From"];
const BOT_NAMES = ["bottom", "Bottom", "BOTTOM", "bottom_depth", "lower_depth", "Lower_depth", "to", "To"];

export function pickColumn(columns: string[], preferred: string[]): string {
  for (const p of preferred) {
    if (columns.includes(p)) return p;
  }
  return columns[0] || "";
}

export function autoDetectColumns(columns: string[]) {
  return {
    longitude: pickColumn(columns, LON_NAMES),
    latitude: pickColumn(columns, LAT_NAMES),
    upperDepth: pickColumn(columns, TOP_NAMES),
    lowerDepth: pickColumn(columns, BOT_NAMES),
    sampleId: pickColumn(columns, ["texid", "sample_id", "id", "ID"]),
  };
}

export function autoDetectProperties(columns: string[]): string[] {
  const pattern = new RegExp("^(" + SOIL_KEYWORDS.join("|") + ")", "i");
  return columns.filter((c) => pattern.test(c));
}

// ---------- Procedures CSV parsing ----------

export function parseSemicolon(s: string): string[] {
  if (!s || !s.trim()) return [];
  // Handle quoted values like "cmol/kg;meq/100g;mmol/kg"
  const cleaned = s.replace(/^"(.*)"$/, "$1");
  return cleaned.split(";").map((v) => v.trim()).filter(Boolean);
}

export function parseProceduresCSV(text: string): ProcedureRow[] {
  // Handle encoding issues
  let lines = text.split("\n").map((l) => l.replace(/;+$/, "").trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // The CSV is semicolon-separated but values can be quoted (containing semicolons)
  // Parse more carefully
  const rows: ProcedureRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Parse semicolon-separated but respect quotes
    const fields = parseSemicolonCSVLine(line);
    if (fields.length < 3) continue;

    rows.push({
      property_phys_chem_id: fields[0] || "",
      procedure_phys_chem_id: fields[1] || "",
      unit_of_measure_id: fields[2] || "",
      value_min: fields[3] || "",
      value_max: fields[4] || "",
      definition: fields[5] || "",
      common_input_units: fields[6] || "",
      conversion_factors: fields[7] || "",
      notes: fields[8] || "",
    });
  }

  return rows;
}

function parseSemicolonCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ";" && !inQuote) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ---------- Lookup functions ----------

/** Get unique property IDs (e.g., "bulkDensityFineEarth", "pHH2O") */
export function getUniquePropertyIds(procedures: ProcedureRow[]): string[] {
  return [...new Set(procedures.map((p) => p.property_phys_chem_id))].sort();
}

/** Get procedure IDs for a given property ID */
export function getProceduresForProperty(procedures: ProcedureRow[], propId: string): string[] {
  return [...new Set(
    procedures.filter((p) => p.property_phys_chem_id === propId)
      .map((p) => p.procedure_phys_chem_id)
  )].sort();
}

/** Get common input units for a property/procedure combination */
export function getUnitsForPropertyProcedure(
  procedures: ProcedureRow[],
  propId: string,
  procId: string
): string[] {
  const match = procedures.find(
    (p) => p.property_phys_chem_id === propId && p.procedure_phys_chem_id === procId
  );
  if (!match) {
    // Fallback: try just property
    const propMatch = procedures.find((p) => p.property_phys_chem_id === propId);
    if (!propMatch) return ["g/kg"];
    const units = parseSemicolon(propMatch.common_input_units);
    return units.length > 0 ? units : [propMatch.unit_of_measure_id].filter(Boolean);
  }
  const units = parseSemicolon(match.common_input_units);
  return units.length > 0 ? units : [match.unit_of_measure_id].filter(Boolean);
}

/** Get the GloSIS reference unit for a property/procedure */
export function getReferenceUnit(
  procedures: ProcedureRow[],
  propId: string,
  procId: string
): string | null {
  const match = procedures.find(
    (p) => p.property_phys_chem_id === propId && p.procedure_phys_chem_id === procId
  );
  return match?.unit_of_measure_id || null;
}

/** Get conversion factor from input unit to reference unit */
export function getConversionFactor(
  procedures: ProcedureRow[],
  propId: string,
  procId: string,
  inputUnit: string
): number {
  const match = procedures.find(
    (p) => p.property_phys_chem_id === propId && p.procedure_phys_chem_id === procId
  );
  if (!match) return 1;

  const refUnit = match.unit_of_measure_id;
  if (inputUnit === refUnit) return 1;

  const commonUnits = parseSemicolon(match.common_input_units);
  const factors = parseSemicolon(match.conversion_factors).map(Number);

  const idx = commonUnits.indexOf(inputUnit);
  if (idx >= 0 && !isNaN(factors[idx])) return factors[idx];

  return 1;
}

/** Get definition text for a property/procedure */
export function getDefinition(
  procedures: ProcedureRow[],
  propId: string,
  procId: string
): string {
  const match = procedures.find(
    (p) => p.property_phys_chem_id === propId && p.procedure_phys_chem_id === procId
  );
  return match?.definition || "";
}

// ---------- Date parsing ----------

export function parseDate(input: string): string {
  const s = input.trim();
  if (/^\d{4}$/.test(s)) return s + "-01-01";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return new Date().toISOString().split("T")[0];
}
