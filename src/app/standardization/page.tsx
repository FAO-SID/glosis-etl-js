"use client";
import { useState, useEffect, useCallback, type ChangeEvent } from "react";

// ── Tab definitions (matches table-definitions.ts TAB_GROUPS) ──
const TAB_GROUPS = [
    {
        label: "Project & Site", icon: "🏗️", tables: [
            { label: "Project", schema: "core", table: "project" },
            { label: "Site", schema: "core", table: "site" },
            { label: "Site Project", schema: "core", table: "project_site" },
            { label: "Project Related", schema: "core", table: "project_related" },
        ]
    },
    {
        label: "Plot", icon: "🗺️", tables: [
            { label: "Plot", schema: "core", table: "plot" },
            { label: "Plot Individual", schema: "core", table: "plot_individual" },
            { label: "Result Desc Plot", schema: "core", table: "result_desc_plot" },
        ]
    },
    {
        label: "Surface", icon: "🛤️", tables: [
            { label: "Surface", schema: "core", table: "surface" },
            { label: "Surface Individual", schema: "core", table: "surface_individual" },
            { label: "Result Desc Surface", schema: "core", table: "result_desc_surface" },
        ]
    },
    {
        label: "Profile", icon: "📊", tables: [
            { label: "Profile", schema: "core", table: "profile" },
            { label: "Result Desc Profile", schema: "core", table: "result_desc_profile" },
        ]
    },
    {
        label: "Element", icon: "↕️", tables: [
            { label: "Element", schema: "core", table: "element" },
            { label: "Result Desc Element", schema: "core", table: "result_desc_element" },
        ]
    },
    {
        label: "Specimen", icon: "🧪", tables: [
            { label: "Specimen", schema: "core", table: "specimen" },
            { label: "Result Phys Chem", schema: "core", table: "result_phys_chem" },
        ]
    },
    {
        label: "Lab Descriptors", icon: "🧬", tables: [
            { label: "Observation Phys Chem", schema: "core", table: "observation_phys_chem" },
            { label: "Property Phys Chem", schema: "core", table: "property_phys_chem" },
            { label: "Procedure Phys Chem", schema: "core", table: "procedure_phys_chem" },
            { label: "Unit of Measure", schema: "core", table: "unit_of_measure" },
        ]
    },
    {
        label: "Metadata", icon: "👤", tables: [
            { label: "Organisation", schema: "metadata", table: "organisation" },
            { label: "Organisation Unit", schema: "metadata", table: "organisation_unit" },
            { label: "Individual", schema: "metadata", table: "individual" },
            { label: "Address", schema: "metadata", table: "address" },
        ]
    },
];

type Step = "database" | "inject" | "viewer";

export default function StandardizationPage() {
    // ── Step state ──
    const [step, setStep] = useState<Step>("database");

    // ── Database step ──
    const [databases, setDatabases] = useState<string[]>([]);
    const [selectedDb, setSelectedDb] = useState("");
    const [newDbName, setNewDbName] = useState("");
    const [dbStatus, setDbStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; msg: string }>({ type: "idle", msg: "" });
    const [connected, setConnected] = useState(false);
    const [tableCount, setTableCount] = useState(0);

    // ── Inject step ──
    const [file, setFile] = useState<File | null>(null);
    const [injecting, setInjecting] = useState(false);
    const [injectResult, setInjectResult] = useState<{
        success?: boolean;
        message?: string;
        errors?: string[];
        counts?: Record<string, number>;
    } | null>(null);

    // ── Viewer step ──
    const [activeGroup, setActiveGroup] = useState(0);
    const [activeSubTab, setActiveSubTab] = useState(0);
    const [tableData, setTableData] = useState<{ columns: string[]; rows: Record<string, unknown>[]; total: number } | null>(null);
    const [loadingTable, setLoadingTable] = useState(false);

    // ── Load databases on mount ──
    const fetchDatabases = useCallback(async () => {
        try {
            const res = await fetch("/api/databases");
            const data = await res.json();
            setDatabases(data.databases || []);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { fetchDatabases(); }, [fetchDatabases]);

    // ── Create database ──
    const handleCreate = async () => {
        if (!newDbName.trim()) return;
        setDbStatus({ type: "loading", msg: "Creating database..." });
        try {
            const res = await fetch("/api/databases", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newDbName.trim() }),
            });
            const data = await res.json();
            if (data.success) {
                setDbStatus({ type: "success", msg: data.message });
                setNewDbName("");
                await fetchDatabases();
                setSelectedDb(newDbName.trim());
            } else {
                setDbStatus({ type: "error", msg: data.message || data.error });
            }
        } catch (e) {
            setDbStatus({ type: "error", msg: String(e) });
        }
    };

    // ── Delete database ──
    const handleDelete = async () => {
        if (!selectedDb) return;
        if (!confirm(`Delete database "${selectedDb}"? This is irreversible!`)) return;
        setDbStatus({ type: "loading", msg: "Deleting..." });
        try {
            const res = await fetch("/api/databases", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: selectedDb }),
            });
            const data = await res.json();
            if (data.success) {
                setDbStatus({ type: "success", msg: data.message });
                setSelectedDb("");
                setConnected(false);
                await fetchDatabases();
            } else {
                setDbStatus({ type: "error", msg: data.message || data.error });
            }
        } catch (e) {
            setDbStatus({ type: "error", msg: String(e) });
        }
    };

    // ── Connect ──
    const handleConnect = async () => {
        if (!selectedDb) return;
        setDbStatus({ type: "loading", msg: "Connecting..." });
        try {
            const res = await fetch("/api/databases/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: selectedDb }),
            });
            const data = await res.json();
            if (data.connected) {
                setConnected(true);
                setTableCount(data.tables);
                setDbStatus({ type: "success", msg: data.message });
            } else {
                setConnected(false);
                setDbStatus({ type: "error", msg: data.message });
            }
        } catch (e) {
            setDbStatus({ type: "error", msg: String(e) });
        }
    };

    // ── Inject ──
    const handleInject = async () => {
        if (!file || !selectedDb) return;
        setInjecting(true);
        setInjectResult(null);
        try {
            const formData = new FormData();
            formData.append("dbName", selectedDb);
            formData.append("file", file);
            const res = await fetch("/api/databases/inject", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            setInjectResult(data);
        } catch (e) {
            setInjectResult({ success: false, message: String(e), errors: [String(e)], counts: {} });
        } finally {
            setInjecting(false);
        }
    };

    // ── Load table data ──
    const loadTable = useCallback(async (groupIdx: number, subIdx: number) => {
        if (!selectedDb) return;
        const grp = TAB_GROUPS[groupIdx];
        const tbl = grp.tables[subIdx];
        setLoadingTable(true);
        setTableData(null);
        try {
            const res = await fetch("/api/databases/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dbName: selectedDb, schema: tbl.schema, table: tbl.table }),
            });
            const data = await res.json();
            setTableData(data);
        } catch {
            setTableData({ columns: [], rows: [], total: 0 });
        } finally {
            setLoadingTable(false);
        }
    }, [selectedDb]);

    useEffect(() => {
        if (step === "viewer" && selectedDb) {
            loadTable(activeGroup, activeSubTab);
        }
    }, [step, activeGroup, activeSubTab, selectedDb, loadTable]);

    // ── Badge ──
    const StatusBadge = ({ s }: { s: typeof dbStatus }) => {
        if (s.type === "idle") return null;
        const colors = { loading: "bg-blue-900 text-blue-300", success: "bg-emerald-900 text-emerald-300", error: "bg-red-900 text-red-300" };
        return (
            <div className={`mt-3 px-4 py-2 rounded-lg text-sm ${colors[s.type]}`}>
                {s.type === "loading" && <span className="inline-block animate-spin mr-2">⏳</span>}
                {s.msg}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            {/* Header */}
            <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-lg sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <a href="/" className="text-zinc-500 hover:text-white transition">←</a>
                        <h1 className="text-lg font-semibold">
                            📥 Glo<span className="text-red-500">SIS</span> Standardization
                        </h1>
                    </div>
                    <div className="flex gap-1">
                        {(["database", "inject", "viewer"] as Step[]).map((s, i) => (
                            <button
                                key={s}
                                onClick={() => setStep(s)}
                                disabled={s !== "database" && !connected}
                                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition ${step === s
                                    ? "bg-red-600 text-white"
                                    : connected || s === "database"
                                        ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                        : "bg-zinc-900 text-zinc-600 cursor-not-allowed"
                                    }`}
                            >
                                {i + 1}. {s === "database" ? "Database" : s === "inject" ? "Upload & Inject" : "Data Viewer"}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {/* ═══════════ STEP 1: DATABASE ═══════════ */}
                {step === "database" && (
                    <div className="space-y-6">
                        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                            <h2 className="text-lg font-medium mb-4">Database Management</h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Select existing */}
                                <div>
                                    <label className="block text-xs text-zinc-400 mb-1">Select Database</label>
                                    <select
                                        value={selectedDb}
                                        onChange={(e) => { setSelectedDb(e.target.value); setConnected(false); }}
                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-red-500/50 focus:outline-none"
                                    >
                                        <option value="">— Select —</option>
                                        {databases.map((db) => (
                                            <option key={db} value={db}>{db}</option>
                                        ))}
                                    </select>

                                    <div className="flex gap-2 mt-3">
                                        <button
                                            onClick={handleConnect}
                                            disabled={!selectedDb || dbStatus.type === "loading"}
                                            className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500 transition disabled:opacity-50"
                                        >
                                            {connected ? "✅ Connected" : "Connect"}
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            disabled={!selectedDb || dbStatus.type === "loading"}
                                            className="px-4 py-2 bg-red-900/50 text-red-400 rounded-lg text-sm font-medium hover:bg-red-800/50 transition disabled:opacity-50"
                                        >
                                            🗑 Delete
                                        </button>
                                    </div>
                                </div>

                                {/* Create new */}
                                <div>
                                    <label className="block text-xs text-zinc-400 mb-1">Create New Database</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="my_soil_project"
                                            value={newDbName}
                                            onChange={(e) => setNewDbName(e.target.value)}
                                            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-red-500/50 focus:outline-none"
                                        />
                                        <button
                                            onClick={handleCreate}
                                            disabled={!newDbName.trim() || dbStatus.type === "loading"}
                                            className="px-6 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-500 transition disabled:opacity-50"
                                        >
                                            + Create
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-zinc-600 mt-1">
                                        Creates a PostgreSQL database with the GloSIS ISO 28258 schema and PostGIS extension.
                                    </p>
                                </div>
                            </div>

                            <StatusBadge s={dbStatus} />

                            {connected && (
                                <div className="mt-4 p-3 rounded-lg bg-emerald-900/20 border border-emerald-800/30 text-sm text-emerald-300">
                                    ✅ Connected to <strong>{selectedDb}</strong> — {tableCount} tables found.
                                    <button
                                        onClick={() => setStep("inject")}
                                        className="ml-4 px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-500 transition"
                                    >
                                        Next: Upload Data →
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                            <h3 className="text-sm font-medium text-zinc-300 mb-3">About</h3>
                            <p className="text-xs text-zinc-500 leading-relaxed">
                                The Standardization app takes a harmonized GloSIS XLSX file (produced by the Harmonization app)
                                and injects its contents into the GloSIS ISO-28258 PostgreSQL database. The injection process
                                populates all related tables: metadata, project, site, plot, profile, element, specimen, and
                                physical/chemical results.
                            </p>
                        </div>
                    </div>
                )}

                {/* ═══════════ STEP 2: UPLOAD & INJECT ═══════════ */}
                {step === "inject" && (
                    <div className="space-y-6">
                        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                            <h2 className="text-lg font-medium mb-1">Upload & Inject Data</h2>
                            <p className="text-sm text-zinc-500 mb-4">
                                Connected to <strong className="text-zinc-300">{selectedDb}</strong>.
                                Upload a harmonized GloSIS XLSX file to inject data into the database.
                            </p>

                            <div className="flex items-center gap-4">
                                <label className="flex-1 cursor-pointer">
                                    <div className={`border-2 border-dashed rounded-xl p-8 text-center transition ${file ? "border-emerald-500/50 bg-emerald-900/10" : "border-zinc-700 hover:border-zinc-500"
                                        }`}>
                                        {file ? (
                                            <div>
                                                <span className="text-2xl">📄</span>
                                                <p className="text-sm text-zinc-300 mt-2 font-medium">{file.name}</p>
                                                <p className="text-xs text-zinc-500">{(file.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                        ) : (
                                            <div>
                                                <span className="text-3xl">📤</span>
                                                <p className="text-sm text-zinc-400 mt-2">Click to upload XLSX file</p>
                                                <p className="text-xs text-zinc-600">Harmonized GloSIS file (max 100MB)</p>
                                            </div>
                                        )}
                                    </div>
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls"
                                        className="hidden"
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                            setFile(e.target.files?.[0] || null);
                                            setInjectResult(null);
                                        }}
                                    />
                                </label>

                                <button
                                    onClick={handleInject}
                                    disabled={!file || injecting}
                                    className="px-8 py-4 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-500 transition disabled:opacity-50"
                                >
                                    {injecting ? (
                                        <span className="flex items-center gap-2">
                                            <span className="animate-spin">⏳</span> Injecting...
                                        </span>
                                    ) : (
                                        "💉 Inject Data"
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Injection result */}
                        {injectResult && (
                            <div className={`bg-zinc-900 rounded-xl border p-6 ${injectResult.success ? "border-emerald-800" : "border-red-800"
                                }`}>
                                <h3 className={`text-sm font-medium mb-3 ${injectResult.success ? "text-emerald-400" : "text-red-400"}`}>
                                    {injectResult.success ? "✅ Injection Complete" : "❌ Injection Failed"}
                                </h3>
                                <p className="text-xs text-zinc-400 mb-4">{injectResult.message}</p>

                                {/* Counts */}
                                {injectResult.counts && Object.keys(injectResult.counts).length > 0 && (
                                    <div className="mb-4">
                                        <h4 className="text-xs text-zinc-500 mb-2">Records inserted:</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {Object.entries(injectResult.counts).map(([key, val]) => (
                                                <span key={key} className="px-2 py-1 bg-zinc-800 rounded text-xs">
                                                    <span className="text-zinc-500">{key}:</span> <strong className="text-zinc-200">{val}</strong>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Errors */}
                                {injectResult.errors && injectResult.errors.length > 0 && (
                                    <div>
                                        <h4 className="text-xs text-zinc-500 mb-2">Warnings/Errors ({injectResult.errors.length}):</h4>
                                        <div className="max-h-[200px] overflow-auto bg-zinc-800 rounded-lg p-3 space-y-1">
                                            {injectResult.errors.slice(0, 50).map((err, i) => (
                                                <p key={i} className="text-[11px] text-amber-400 font-mono">{err}</p>
                                            ))}
                                            {injectResult.errors.length > 50 && (
                                                <p className="text-xs text-zinc-500">...and {injectResult.errors.length - 50} more</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {injectResult.success && (
                                    <button
                                        onClick={() => setStep("viewer")}
                                        className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 transition"
                                    >
                                        View Injected Data →
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════ STEP 3: DATA VIEWER ═══════════ */}
                {step === "viewer" && (
                    <div className="space-y-4">
                        {/* Group tabs */}
                        <div className="flex flex-wrap gap-1 bg-zinc-900 rounded-xl border border-zinc-800 p-2">
                            {TAB_GROUPS.map((grp, i) => (
                                <button
                                    key={i}
                                    onClick={() => { setActiveGroup(i); setActiveSubTab(0); }}
                                    className={`px-3 py-2 rounded-lg text-xs font-medium transition ${activeGroup === i
                                        ? "bg-red-600 text-white"
                                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                        }`}
                                >
                                    <span className="mr-1">{grp.icon}</span> {grp.label}
                                </button>
                            ))}
                        </div>

                        {/* Sub tabs */}
                        <div className="flex gap-1">
                            {TAB_GROUPS[activeGroup].tables.map((tbl, i) => (
                                <button
                                    key={i}
                                    onClick={() => setActiveSubTab(i)}
                                    className={`px-3 py-1.5 rounded-lg text-xs transition ${activeSubTab === i
                                        ? "bg-amber-600 text-white"
                                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                        }`}
                                >
                                    {tbl.label}
                                </button>
                            ))}
                        </div>

                        {/* Table */}
                        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-medium text-zinc-300">
                                    {TAB_GROUPS[activeGroup].tables[activeSubTab].schema}.{TAB_GROUPS[activeGroup].tables[activeSubTab].table}
                                </h3>
                                {tableData && (
                                    <span className="text-xs text-zinc-500">
                                        {tableData.total} total rows {tableData.rows.length < tableData.total ? `(showing ${tableData.rows.length})` : ""}
                                    </span>
                                )}
                            </div>

                            {loadingTable ? (
                                <div className="flex items-center justify-center py-12">
                                    <span className="animate-spin text-2xl mr-3">⏳</span>
                                    <span className="text-zinc-400">Loading...</span>
                                </div>
                            ) : tableData && tableData.columns.length > 0 ? (
                                <div className="overflow-auto max-h-[500px] rounded-lg border border-zinc-700">
                                    <table className="w-full text-xs">
                                        <thead className="sticky top-0 bg-zinc-800 z-10">
                                            <tr>
                                                {tableData.columns.map((col) => (
                                                    <th key={col} className="text-left px-3 py-2 text-zinc-300 font-medium whitespace-nowrap border-b border-zinc-700">
                                                        {col}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tableData.rows.map((row, i) => (
                                                <tr key={i} className="border-b border-zinc-800 hover:bg-zinc-800/50 transition">
                                                    {tableData.columns.map((col) => (
                                                        <td key={col} className="px-3 py-1.5 text-zinc-400 whitespace-nowrap font-mono">
                                                            {row[col] !== null && row[col] !== undefined ? String(row[col]) : "—"}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-zinc-600">
                                    <span className="text-3xl">📭</span>
                                    <p className="mt-2 text-sm">No data found in this table.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
