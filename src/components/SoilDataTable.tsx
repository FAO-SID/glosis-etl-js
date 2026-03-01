"use client";
import { useMemo, useState } from "react";
import type { SoilDataRow } from "./MapView";

interface SoilDataTableProps {
  data: SoilDataRow[];
  selectedCodes: Set<string>;
  onSelectCodes: (codes: Set<string>) => void;
}

export default function SoilDataTable({ data, selectedCodes, onSelectCodes }: SoilDataTableProps) {
  const [filter, setFilter] = useState("");
  const [sortCol, setSortCol] = useState<string>("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const columns = useMemo(() => {
    if (data.length === 0) return [];
    // We filter out native properties and 'code' since we now show profile_code and element_id
    return Object.keys(data[0]).filter((k) => k !== "__proto__" && k !== "code");
  }, [data]);

  const filteredData = useMemo(() => {
    let rows = selectedCodes.size > 0 ? data.filter((r) => selectedCodes.has(r.code)) : data;
    if (filter.trim()) {
      const q = filter.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some((v) => String(v).toLowerCase().includes(q))
      );
    }
    // Sort
    rows = [...rows].sort((a, b) => {
      const va = a[sortCol] as string | number | null;
      const vb = b[sortCol] as string | number | null;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      return sortDir === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return rows;
  }, [data, selectedCodes, filter, sortCol, sortDir]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const clearSelection = () => onSelectCodes(new Set());

  const exportToCsv = () => {
    if (filteredData.length === 0) return;

    // Build header row
    const headerRow = columns.join(",");

    // Build data rows
    const dataRows = filteredData.map(row => {
      return columns.map(col => {
        let val = row[col];
        if (val == null) val = "";
        const strVal = String(val);
        // Escape quotes
        if (strVal.includes(",") || strVal.includes('"') || strVal.includes("\n")) {
          return `"${strVal.replace(/"/g, '""')}"`;
        }
        return strVal;
      }).join(",");
    });

    // Combine and download
    const csvContent = [headerRow, ...dataRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "glosis_elements_export.csv");
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Search all columns..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
        />
        {selectedCodes.size > 0 && (
          <button
            onClick={clearSelection}
            className="px-3 py-2 text-xs bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition shadow-sm border border-red-900/30"
          >
            Clear selection ({selectedCodes.size})
          </button>
        )}
        <button
          onClick={exportToCsv}
          disabled={filteredData.length === 0}
          className="px-3 py-2 text-xs bg-emerald-600/20 text-emerald-400 rounded-lg hover:bg-emerald-600/30 transition shadow-sm border border-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
        <span className="text-xs text-zinc-500 ml-auto whitespace-nowrap">
          {filteredData.length} / {data.length} rows
        </span>
      </div>
      <div className="overflow-auto max-h-[400px] rounded-lg border border-zinc-700">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-zinc-800 z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="text-left px-2 py-2 text-zinc-300 font-medium cursor-pointer hover:text-white select-none whitespace-nowrap"
                >
                  {col}
                  {sortCol === col && (
                    <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row) => (
              <tr
                key={row.code}
                className="border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors"
              >
                {columns.map((col) => (
                  <td key={col} className="px-2 py-1.5 text-zinc-300 whitespace-nowrap font-mono">
                    {row[col] != null ? String(row[col]) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
