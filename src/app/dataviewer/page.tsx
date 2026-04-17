"use client";
import { useState, useEffect, useCallback } from "react";
import MapView, { SoilDataRow } from "@/components/MapView";
import PropertyBars from "@/components/PropertyBars";
import SoilDataTable from "@/components/SoilDataTable";

export default function DataViewerPage() {
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<SoilDataRow[]>([]);
  const [propertyColumns, setPropertyColumns] = useState<string[]>([]);
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

  // Fetch available databases on mount
  useEffect(() => {
    fetch("/api/databases")
      .then((r) => r.json())
      .then((d) => {
        if (d.databases) {
          setDatabases(d.databases);
          if (d.databases.length > 0) setSelectedDb(d.databases[0]);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  // Connect and fetch data
  const handleConnect = useCallback(async () => {
    if (!selectedDb) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/data?db=${encodeURIComponent(selectedDb)}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      setData(json.data || []);
      const sortedCols = [...(json.propertyColumns || [])].sort((a, b) => a.localeCompare(b));
      setPropertyColumns(sortedCols);
      // Auto-select first 3 properties
      setSelectedProperties(sortedCols.slice(0, 3));
      setConnected(true);
      setSelectedCodes(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }, [selectedDb]);

  const handleDisconnect = () => {
    setConnected(false);
    setData([]);
    setPropertyColumns([]);
    setSelectedProperties([]);
    setSelectedCodes(new Set());
  };

  const toggleProperty = (prop: string) => {
    setSelectedProperties((prev) =>
      prev.includes(prop) ? prev.filter((p) => p !== prop) : [...prev, prop]
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 border-b border-zinc-700 px-6 py-4">
        <div className="flex items-center justify-between max-w-[1800px] mx-auto">
          <div className="flex items-center gap-4">
            <a href="/" className="text-zinc-400 hover:text-white transition">
              ← Home
            </a>
            <h1 className="text-xl font-semibold">
              <span className="text-red-500">GloSIS</span> Data Viewer
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedDb}
              onChange={(e) => setSelectedDb(e.target.value)}
              disabled={connected}
              className="px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm disabled:opacity-50"
            >
              {databases.map((db) => (
                <option key={db} value={db}>
                  {db}
                </option>
              ))}
            </select>
            <button
              onClick={connected ? handleDisconnect : handleConnect}
              disabled={loading}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${connected
                  ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                  : "bg-emerald-600 text-white hover:bg-emerald-500"
                } disabled:opacity-50`}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading...
                </span>
              ) : connected ? (
                "Disconnect"
              ) : (
                "Connect"
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-32">
          <div className="text-center space-y-4">
            <svg className="animate-spin h-12 w-12 mx-auto text-red-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-zinc-400">Fetching data from <strong>{selectedDb}</strong>...</p>
          </div>
        </div>
      )}

      {/* Main Content — only visible when connected */}
      {connected && !loading && (
        <div className="max-w-[1800px] mx-auto p-6 space-y-6">
          {/* Top row: Map + Property Bars */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Map */}
            <div className="lg:col-span-2 bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <h2 className="font-medium text-zinc-200">
                  Soil Profile Selection
                </h2>
                <span className="text-xs text-zinc-500">
                  {data.length} elements
                </span>
              </div>
              <div className="h-[520px]">
                <MapView
                  data={data}
                  selectedCodes={selectedCodes}
                  onSelectCodes={setSelectedCodes}
                />
              </div>
            </div>

            {/* Property Bars */}
            <div className="lg:col-span-3 bg-zinc-900 rounded-xl border border-zinc-800">
              <div className="px-4 py-3 border-b border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-medium text-zinc-200">
                    Vertical Distribution of Soil Properties
                  </h2>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {propertyColumns.map((prop) => (
                    <button
                      key={prop}
                      onClick={() => toggleProperty(prop)}
                      className={`px-2 py-0.5 rounded text-xs transition ${selectedProperties.includes(prop)
                          ? "bg-red-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                        }`}
                    >
                      {prop}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-[520px]">
                <PropertyBars
                  data={data}
                  selectedProperties={selectedProperties}
                  selectedCodes={selectedCodes}
                  onSelectCodes={setSelectedCodes}
                />
              </div>
            </div>
          </div>

          {/* Bottom row: Data Table */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
            <h2 className="font-medium text-zinc-200 mb-3">Soil Locations</h2>
            <SoilDataTable
              data={data}
              selectedCodes={selectedCodes}
              onSelectCodes={setSelectedCodes}
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!connected && !loading && (
        <div className="flex items-center justify-center py-32">
          <div className="text-center space-y-4 max-w-md">
            <div className="text-6xl">🗺️</div>
            <h2 className="text-2xl font-semibold text-zinc-300">Data Viewer</h2>
            <p className="text-zinc-500">
              Select a database from the dropdown above and click{" "}
              <strong className="text-emerald-400">Connect</strong> to explore soil data with
              interactive maps, property distributions, and data tables.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
