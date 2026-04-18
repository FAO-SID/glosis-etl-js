"use client";
import { useMemo } from "react";
import type { SoilDataRow } from "./MapView";

interface PropertyBarsProps {
  data: SoilDataRow[];
  selectedProperties: string[];
  selectedCodes: Set<string>;
  onSelectCodes: (codes: Set<string>) => void;
}

export default function PropertyBars({
  data,
  selectedProperties,
  selectedCodes,
  onSelectCodes,
}: PropertyBarsProps) {
  // Compute min/max for each property (global scale)
  const scales = useMemo(() => {
    const s: Record<string, { min: number; max: number }> = {};
    for (const prop of selectedProperties) {
      let min = Infinity;
      let max = -Infinity;
      for (const row of data) {
        const v = row[prop] as number | null;
        if (v != null && !isNaN(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      s[prop] = { min: min === Infinity ? 0 : min, max: max === -Infinity ? 1 : max };
    }
    return s;
  }, [data, selectedProperties]);

  // Filter shown rows
  const displayData = useMemo(() => {
    if (selectedCodes.size === 0) return data;
    return data.filter((r) => selectedCodes.has(r.code));
  }, [data, selectedCodes]);

  const toggleCode = (code: string) => {
    const newSet = new Set(selectedCodes);
    if (newSet.has(code)) {
      newSet.delete(code);
    } else {
      newSet.add(code);
    }
    onSelectCodes(newSet);
  };

  if (selectedProperties.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
        Select one or more properties above to display distributions.
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-[520px]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-zinc-800 z-10">
          <tr>
            <th className="text-left px-2 py-1.5 text-zinc-300 font-medium w-64">Profile / Element (Depth)</th>
            {selectedProperties.map((prop) => (
              <th key={prop} className="text-left px-2 py-1.5 text-zinc-300 font-medium">
                {prop}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayData.map((row) => {
            const isSelected = selectedCodes.size === 0 || selectedCodes.has(row.code);
            return (
              <tr
                key={row.code}
                onClick={() => toggleCode(row.code)}
                className={`cursor-pointer border-b border-zinc-700/50 transition-colors ${isSelected
                  ? "bg-zinc-800/50 hover:bg-zinc-700/50"
                  : "opacity-40 hover:opacity-70"
                  }`}
              >
                <td className="px-2 py-1 font-mono text-xs text-zinc-400 truncate max-w-[16rem]" title={`${String(row.profile_code || "N/A")} / ${String(row.element_id || "N/A")} [${row.upper_depth ?? "?"}-${row.lower_depth ?? "?"} cm]`}>
                  {String(row.profile_code || "N/A")} / {String(row.element_id || "N/A")} <span className="text-zinc-600 ml-1">[{row.upper_depth ?? "?"}-{row.lower_depth ?? "?"} cm]</span>
                </td>
                {selectedProperties.map((prop) => {
                  const val = row[prop] as number | null;
                  const scale = scales[prop];
                  const range = scale.max - scale.min || 1;
                  const pct = val != null ? ((val - scale.min) / range) * 100 : 0;
                  return (
                    <td key={prop} className="px-2 py-1">
                      <div className="relative h-5 bg-zinc-700/30 rounded overflow-hidden">
                        {val != null && (
                          <>
                            <div
                              className="absolute inset-y-0 left-0 rounded transition-all duration-300"
                              style={{
                                width: `${Math.max(pct, 2)}%`,
                                backgroundColor: "#E42D3A",
                              }}
                            />
                            <span className="absolute inset-0 flex items-center px-1.5 text-[11px] font-mono text-white/90">
                              {val.toFixed(2)}
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
