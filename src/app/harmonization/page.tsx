"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
    autoDetectColumns,
    autoDetectProperties,
    getUniquePropertyIds,
    getProceduresForProperty,
    getUnitsForPropertyProcedure,
    getConversionFactor,
    getReferenceUnit,
    getDefinition,
    type ProcedureRow,
    type PropertyMapping,
} from "@/lib/harmonization";
import {
    runQCChecks,
    qcSummary,
    type QCResults,
    type QCConfig,
} from "@/lib/qc-checks";

type Step = "upload" | "mapping" | "properties" | "metadata" | "generate";

interface ParsedData {
    headers: string[];
    rows: Record<string, string>[];
    rawText: string;
}

export default function HarmonizationPage() {
    const [step, setStep] = useState<Step>("upload");
    const [data, setData] = useState<ParsedData | null>(null);
    const [procedures, setProcedures] = useState<ProcedureRow[]>([]);
    const [fileName, setFileName] = useState("");
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Column mapping
    const [sampleIdCol, setSampleIdCol] = useState("");
    const [lonCol, setLonCol] = useState("");
    const [latCol, setLatCol] = useState("");
    const [topCol, setTopCol] = useState("");
    const [botCol, setBotCol] = useState("");
    const [horCol, setHorCol] = useState("");
    const [selectedProps, setSelectedProps] = useState<string[]>([]);

    // Config
    const [projectName, setProjectName] = useState("My_Project");
    const [projectNameCol, setProjectNameCol] = useState(""); // column to use for project name
    const [siteCode, setSiteCode] = useState("Site_1");
    const [siteCodeCol, setSiteCodeCol] = useState(""); // column to use for site code
    const [dateVal, setDateVal] = useState(new Date().toISOString().split("T")[0]);
    const [dateCol, setDateCol] = useState(""); // column to use for date
    const [plotType, setPlotType] = useState("TrialPit");
    const [horizonType, setHorizonType] = useState("Horizon");

    // Property mappings (per selected property)
    const [propMappings, setPropMappings] = useState<
        Record<string, { propertyId: string; procedureId: string; inputUnit: string }>
    >({});

    // Metadata
    const [metadata, setMetadata] = useState({
        name: "", honorific_title: "", role: "", email: "",
        telephone: "", url: "", organization: "",
        street_address: "", postal_code: "", locality: "", country: "",
    });

    // QC state
    const [qcResults, setQcResults] = useState<QCResults | null>(null);
    const [downloadingQC, setDownloadingQC] = useState(false);

    // Load procedures on mount
    useEffect(() => {
        fetch("/api/procedures")
            .then((r) => r.json())
            .then((d) => d.procedures && setProcedures(d.procedures))
            .catch(console.error);
    }, []);

    // File upload handler
    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
            if (lines.length < 2) { setError("File has less than 2 rows"); return; }
            const sep = lines[0].includes(";") ? ";" : ",";
            const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"(.*)"$/, "$1"));
            const rows = lines.slice(1).map((line) => {
                const vals = line.split(sep).map((v) => v.trim().replace(/^"(.*)"$/, "$1"));
                const row: Record<string, string> = {};
                headers.forEach((h, j) => { row[h] = vals[j] || ""; });
                return row;
            });

            setData({ headers, rows, rawText: text });

            // Auto-detect columns
            const detected = autoDetectColumns(headers);
            setSampleIdCol(detected.sampleId);
            setLonCol(detected.longitude);
            setLatCol(detected.latitude);
            setTopCol(detected.upperDepth);
            setBotCol(detected.lowerDepth);

            // Auto-detect soil properties
            const autoProps = autoDetectProperties(headers);
            setSelectedProps(autoProps);

            setStep("mapping");
            setError(null);
            setQcResults(null);
        };
        reader.readAsText(file);
    }, []);

    // Initialize property mappings when properties change
    useEffect(() => {
        if (procedures.length === 0 || selectedProps.length === 0) return;

        const newMappings: typeof propMappings = {};
        for (const prop of selectedProps) {
            if (propMappings[prop]) { newMappings[prop] = propMappings[prop]; continue; }
            const propChoices = getUniquePropertyIds(procedures);
            const defaultPropId = propChoices[0] || "";
            const procChoices = getProceduresForProperty(procedures, defaultPropId);
            const defaultProcId = procChoices[0] || "";
            const units = getUnitsForPropertyProcedure(procedures, defaultPropId, defaultProcId);
            newMappings[prop] = {
                propertyId: defaultPropId,
                procedureId: defaultProcId,
                inputUnit: units[0] || "",
            };
        }
        setPropMappings(newMappings);
    }, [selectedProps, procedures]); // eslint-disable-line react-hooks/exhaustive-deps

    // Run QC checks whenever data/mappings change
    const runQC = useCallback(() => {
        if (!data || procedures.length === 0) return;

        const mappings: PropertyMapping[] = selectedProps.map((col) => ({
            columnName: col,
            propertyId: propMappings[col]?.propertyId || "",
            procedureId: propMappings[col]?.procedureId || "",
            inputUnit: propMappings[col]?.inputUnit || "",
        }));

        const qcConfig: QCConfig = {
            sampleIdCol,
            longitudeCol: lonCol,
            latitudeCol: latCol,
            upperDepthCol: topCol,
            lowerDepthCol: botCol,
            horizonCol: horCol || undefined,
            propertyMappings: mappings,
            selectedProps,
        };

        const results = runQCChecks(data.rows, qcConfig, procedures);
        setQcResults(results);
    }, [data, procedures, selectedProps, propMappings, sampleIdCol, lonCol, latCol, topCol, botCol, horCol]);

    // Trigger QC when entering properties step or generate step
    useEffect(() => {
        if (step === "properties" || step === "generate") {
            runQC();
        }
    }, [step, runQC]);

    // QC summary for display
    const qcSummaryItems = useMemo(() => {
        if (!qcResults) return [];
        return qcSummary(qcResults);
    }, [qcResults]);

    const totalIssues = qcSummaryItems.reduce((sum, item) => sum + item.count, 0);

    // Download QC report
    const handleDownloadQC = useCallback(async () => {
        if (!data) return;
        setDownloadingQC(true);

        const mappings: PropertyMapping[] = selectedProps.map((col) => ({
            columnName: col,
            propertyId: propMappings[col]?.propertyId || "",
            procedureId: propMappings[col]?.procedureId || "",
            inputUnit: propMappings[col]?.inputUnit || "",
        }));

        try {
            const res = await fetch("/api/qc-report", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    csvText: data.rawText,
                    config: {
                        sampleIdCol,
                        longitudeCol: lonCol,
                        latitudeCol: latCol,
                        upperDepthCol: topCol,
                        lowerDepthCol: botCol,
                        horizonCol: horCol,
                        propertyMappings: mappings,
                        selectedProps,
                    },
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "QC report generation failed");
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `QC_report_${new Date().toISOString().split("T")[0]}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to generate QC report");
        } finally {
            setDownloadingQC(false);
        }
    }, [data, selectedProps, propMappings, sampleIdCol, lonCol, latCol, topCol, botCol, horCol]);

    // Generate XLSX
    const handleGenerate = useCallback(async () => {
        if (!data) return;
        setGenerating(true);
        setError(null);

        const mappings: PropertyMapping[] = selectedProps.map((col) => ({
            columnName: col,
            propertyId: propMappings[col]?.propertyId || "",
            procedureId: propMappings[col]?.procedureId || "",
            inputUnit: propMappings[col]?.inputUnit || "",
        }));

        try {
            const res = await fetch("/api/harmonize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    csvText: data.rawText,
                    config: {
                        sampleIdCol, longitudeCol: lonCol, latitudeCol: latCol,
                        upperDepthCol: topCol, lowerDepthCol: botCol, horizonCol: horCol,
                        projectName, projectNameCol, siteCode, siteCodeCol,
                        date: dateVal, dateCol, plotType, horizonType,
                        propertyMappings: mappings, metadata,
                    },
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Generation failed");
            }

            // Download XLSX
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `GloSIS_harmonized_${new Date().toISOString().split("T")[0]}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to generate");
        } finally {
            setGenerating(false);
        }
    }, [data, selectedProps, propMappings, sampleIdCol, lonCol, latCol, topCol, botCol, horCol, projectName, projectNameCol, siteCode, siteCodeCol, dateVal, dateCol, plotType, horizonType, metadata]);

    // Step navigation
    const steps: { id: Step; label: string; icon: string }[] = [
        { id: "upload", label: "Upload", icon: "📁" },
        { id: "mapping", label: "Columns", icon: "🔗" },
        { id: "properties", label: "Properties", icon: "🧪" },
        { id: "metadata", label: "Metadata", icon: "📝" },
        { id: "generate", label: "Generate", icon: "📥" },
    ];
    const stepIdx = steps.findIndex((s) => s.id === step);

    const Select = ({ value, onChange, options, label }: {
        value: string; onChange: (v: string) => void; options: string[]; label: string;
    }) => (
        <div>
            <label className="block text-xs text-zinc-400 mb-1">{label}</label>
            <select value={value} onChange={(e) => onChange(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-red-500/50 focus:outline-none">
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
        </div>
    );

    // QC Panel component
    const QCPanel = () => {
        if (!qcResults) return null;

        return (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">🛡️</span>
                    <h2 className="text-lg font-semibold">Data Quality Checks</h2>
                </div>

                <ul className="space-y-1 text-sm mb-4">
                    {qcSummaryItems.map((item) => (
                        <li key={item.label} className="flex items-center gap-2">
                            <span className={`inline-block w-7 text-center rounded text-xs font-bold py-0.5 ${item.count > 0 ? "bg-red-600/20 text-red-400" : "bg-emerald-600/20 text-emerald-400"
                                }`}>
                                {item.count}
                            </span>
                            <span className="text-zinc-400">{item.label}</span>
                        </li>
                    ))}
                </ul>

                {totalIssues > 0 ? (
                    <div className="space-y-3">
                        <div className="p-3 bg-red-900/20 border border-red-700/40 rounded-lg">
                            <div className="flex items-start gap-2">
                                <span className="text-red-400 text-lg">⚠️</span>
                                <div>
                                    <div className="text-red-300 font-semibold text-sm">
                                        {totalIssues} issue{totalIssues !== 1 ? "s" : ""} found in the dataset.
                                    </div>
                                    <div className="text-red-400/80 text-xs mt-1">
                                        1. Ensure your properties, methods, and units are correctly identified.<br />
                                        2. Download the QC report for full details.
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={handleDownloadQC}
                            disabled={downloadingQC}
                            className="w-full px-4 py-2.5 bg-red-600 text-white rounded-lg font-semibold text-sm hover:bg-red-500 transition disabled:opacity-50"
                        >
                            {downloadingQC ? "Generating..." : "📥 Download QC Report (XLSX)"}
                        </button>
                    </div>
                ) : (
                    <div className="p-3 bg-emerald-900/20 border border-emerald-700/40 rounded-lg">
                        <div className="flex items-center gap-2">
                            <span className="text-emerald-400">✅</span>
                            <span className="text-emerald-300 font-semibold text-sm">Data ready to harmonize.</span>
                        </div>
                        <div className="text-amber-400/80 text-xs mt-1">
                            ⚠️ Please ensure your soil properties are correctly mapped to the GloSIS properties, methods, and units.
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            {/* Header */}
            <header className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 border-b border-zinc-700 px-6 py-4">
                <div className="flex items-center gap-4 max-w-6xl mx-auto">
                    <a href="/" className="text-zinc-400 hover:text-white transition">← Home</a>
                    <h1 className="text-xl font-semibold">
                        <span className="text-red-500">GloSIS</span> Harmonization
                    </h1>
                </div>
            </header>

            {/* Step indicators */}
            <div className="max-w-6xl mx-auto px-6 pt-6">
                <div className="flex items-center gap-2 mb-6">
                    {steps.map((s, i) => (
                        <button key={s.id} onClick={() => i <= stepIdx + 1 && data ? setStep(s.id) : null}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${step === s.id ? "bg-red-600 text-white" :
                                i < stepIdx ? "bg-zinc-700 text-zinc-300 cursor-pointer" :
                                    "bg-zinc-800/50 text-zinc-500"
                                }`}>
                            <span>{s.icon}</span> {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div className="max-w-6xl mx-auto px-6 mb-4">
                    <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>
                </div>
            )}

            <main className="max-w-6xl mx-auto px-6 pb-12">
                {/* Step 1: Upload */}
                {step === "upload" && (
                    <div className="flex items-center justify-center py-20">
                        <label className="block p-16 border-2 border-dashed border-zinc-600 rounded-2xl text-center cursor-pointer hover:border-red-500/50 transition-colors">
                            <div className="text-5xl mb-4">📁</div>
                            <div className="text-lg font-medium mb-2">Upload your soil dataset</div>
                            <div className="text-sm text-zinc-500">Supports CSV and TXT files (comma or semicolon separated)</div>
                            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
                        </label>
                    </div>
                )}

                {/* Step 2: Column Mapping */}
                {step === "mapping" && data && (
                    <div className="space-y-6">
                        {/* Data Preview at the top for reference */}
                        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                            <h2 className="text-lg font-medium mb-3">Data Preview (first 5 rows)</h2>
                            <div className="overflow-auto max-h-[250px] rounded-lg border border-zinc-700">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-zinc-800">
                                        <tr>
                                            {data.headers.map((h) => (
                                                <th key={h} className="text-left px-2 py-2 text-zinc-300 font-medium whitespace-nowrap">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.rows.slice(0, 5).map((row, i) => (
                                            <tr key={i} className="border-b border-zinc-800">
                                                {data.headers.map((h) => (
                                                    <td key={h} className="px-2 py-1.5 text-zinc-400 whitespace-nowrap font-mono">{row[h] || "—"}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Project Configuration — right after Data Preview */}
                        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                            <h2 className="text-lg font-medium mb-3">Project configuration</h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {/* Project Name: column selector or free text */}
                                <div className="space-y-1.5">
                                    <label className="block text-xs text-zinc-400">Project Name</label>
                                    <select
                                        value={projectNameCol}
                                        onChange={(e) => setProjectNameCol(e.target.value)}
                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-red-500/50 focus:outline-none">
                                        <option value="">— type a name below —</option>
                                        {data.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    {!projectNameCol && (
                                        <input
                                            type="text"
                                            value={projectName}
                                            onChange={(e) => setProjectName(e.target.value)}
                                            placeholder="e.g. My_Project"
                                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-red-500/50 focus:outline-none" />
                                    )}
                                    {projectNameCol && (
                                        <p className="text-xs text-zinc-500">Values taken from column <strong className="text-zinc-300">{projectNameCol}</strong></p>
                                    )}
                                </div>

                                {/* Site Code: column selector or free text */}
                                <div className="space-y-1.5">
                                    <label className="block text-xs text-zinc-400">Site Code</label>
                                    <select
                                        value={siteCodeCol}
                                        onChange={(e) => setSiteCodeCol(e.target.value)}
                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-red-500/50 focus:outline-none">
                                        <option value="">— type a code below —</option>
                                        {data.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    {!siteCodeCol && (
                                        <input
                                            type="text"
                                            value={siteCode}
                                            onChange={(e) => setSiteCode(e.target.value)}
                                            placeholder="e.g. Site_1"
                                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-red-500/50 focus:outline-none" />
                                    )}
                                    {siteCodeCol && (
                                        <p className="text-xs text-zinc-500">Values taken from column <strong className="text-zinc-300">{siteCodeCol}</strong></p>
                                    )}
                                </div>

                                {/* Date: column selector or date picker (default = today) */}
                                <div className="space-y-1.5">
                                    <label className="block text-xs text-zinc-400">Date</label>
                                    <select
                                        value={dateCol}
                                        onChange={(e) => setDateCol(e.target.value)}
                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-red-500/50 focus:outline-none">
                                        <option value="">— pick a date below —</option>
                                        {data.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    {!dateCol && (
                                        <input
                                            type="date"
                                            value={dateVal}
                                            onChange={(e) => setDateVal(e.target.value)}
                                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-red-500/50 focus:outline-none" />
                                    )}
                                    {dateCol && (
                                        <p className="text-xs text-zinc-500">Values taken from column <strong className="text-zinc-300">{dateCol}</strong></p>
                                    )}
                                </div>

                                <Select label="Plot Type" value={plotType} onChange={setPlotType} options={["TrialPit", "Borehole", "Surface"]} />
                                <Select label="Horizon Type" value={horizonType} onChange={setHorizonType} options={["Horizon", "Layer"]} />
                            </div>
                        </div>

                        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                            <h2 className="text-lg font-medium mb-1">Column Mapping</h2>
                            <p className="text-sm text-zinc-500 mb-4">
                                File: <strong className="text-zinc-300">{fileName}</strong> — {data.rows.length} rows, {data.headers.length} columns.
                                Columns were auto-detected. Adjust if needed.
                            </p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <Select label="Sample ID" value={sampleIdCol} onChange={setSampleIdCol} options={data.headers} />
                                <Select label="Longitude (X)" value={lonCol} onChange={setLonCol} options={data.headers} />
                                <Select label="Latitude (Y)" value={latCol} onChange={setLatCol} options={data.headers} />
                                <Select label="Upper Depth (top)" value={topCol} onChange={setTopCol} options={data.headers} />
                                <Select label="Lower Depth (bottom)" value={botCol} onChange={setBotCol} options={data.headers} />
                                <Select label="Horizon (optional)" value={horCol} onChange={setHorCol} options={["", ...data.headers]} />
                            </div>
                        </div>

                        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                            <h2 className="text-lg font-medium mb-1">Soil Properties</h2>
                            <p className="text-sm text-zinc-500 mb-3">Select the columns containing soil measurements.</p>
                            <div className="flex flex-wrap gap-2">
                                {data.headers.map((h) => (
                                    <button key={h}
                                        onClick={() => setSelectedProps((prev) =>
                                            prev.includes(h) ? prev.filter((p) => p !== h) : [...prev, h]
                                        )}
                                        className={`px-2.5 py-1 rounded-lg text-xs transition ${selectedProps.includes(h)
                                            ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                            }`}>
                                        {h}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button onClick={() => setStep("properties")}
                            className="px-6 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-500 transition">
                            Next: Configure Properties →
                        </button>
                    </div>
                )}

                {/* Step 3: Properties */}
                {step === "properties" && (
                    <div className="space-y-6">
                        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                            <h2 className="text-lg font-medium mb-1">Property-Procedure Mapping</h2>
                            <p className="text-sm text-zinc-500 mb-4">
                                Configure the GloSIS reference name, analytical procedure, and measurement units for each soil property.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {selectedProps.map((prop) => {
                                    const mapping = propMappings[prop] || { propertyId: "", procedureId: "", inputUnit: "" };
                                    const propChoices = getUniquePropertyIds(procedures);
                                    const procChoices = getProceduresForProperty(procedures, mapping.propertyId);
                                    const unitChoices = getUnitsForPropertyProcedure(procedures, mapping.propertyId, mapping.procedureId);
                                    const refUnit = getReferenceUnit(procedures, mapping.propertyId, mapping.procedureId);
                                    const displayRefUnit = refUnit || (unitChoices.length > 0 ? unitChoices[0] : null);
                                    const factor = mapping.inputUnit && displayRefUnit
                                        ? getConversionFactor(procedures, mapping.propertyId, mapping.procedureId, mapping.inputUnit) : 1;
                                    const formatFactor = (f: number) => {
                                        if (Number.isInteger(f)) return f.toString();
                                        const s = f.toPrecision(6);
                                        return parseFloat(s).toString();
                                    };

                                    return (
                                        <div key={prop} className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50 space-y-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-medium text-zinc-400">Column:</span>
                                                <span className="px-2 py-0.5 bg-red-600/20 text-red-400 rounded text-xs font-medium">{prop}</span>
                                            </div>
                                            <Select label="GloSIS Reference Name" value={mapping.propertyId}
                                                onChange={(v) => setPropMappings((prev) => {
                                                    const newProcs = getProceduresForProperty(procedures, v);
                                                    const newProcId = newProcs[0] || "";
                                                    const newUnits = getUnitsForPropertyProcedure(procedures, v, newProcId);
                                                    return { ...prev, [prop]: { propertyId: v, procedureId: newProcId, inputUnit: newUnits[0] || "" } };
                                                })}
                                                options={propChoices} />
                                            <Select label="Analytical Procedure" value={mapping.procedureId}
                                                onChange={(v) => setPropMappings((prev) => {
                                                    const curPropId = prev[prop]?.propertyId || "";
                                                    const newUnits = getUnitsForPropertyProcedure(procedures, curPropId, v);
                                                    return { ...prev, [prop]: { ...prev[prop], procedureId: v, inputUnit: newUnits[0] || "" } };
                                                })}
                                                options={procChoices} />
                                            <Select label="Your Data Units" value={mapping.inputUnit}
                                                onChange={(v) => setPropMappings((prev) => ({ ...prev, [prop]: { ...prev[prop], inputUnit: v } }))}
                                                options={unitChoices.length > 0 ? unitChoices : [mapping.inputUnit || "g/kg"]} />
                                            {displayRefUnit && (
                                                <div className="text-xs text-zinc-500">
                                                    GloSIS unit: <strong className="text-zinc-300">{displayRefUnit}</strong>
                                                    {factor !== 1 && (
                                                        <span className="text-amber-400 ml-1">
                                                            → ×{formatFactor(factor)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* QC Panel — shown on Properties step */}
                        <QCPanel />

                        <div className="flex gap-3">
                            <button onClick={() => setStep("mapping")}
                                className="px-5 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition">
                                ← Back
                            </button>
                            <button onClick={() => setStep("metadata")}
                                className="px-6 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-500 transition">
                                Next: Metadata →
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 4: Metadata */}
                {step === "metadata" && (
                    <div className="space-y-6">
                        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
                            <h2 className="text-lg font-medium mb-1">Contact & Organization Metadata</h2>
                            <p className="text-sm text-zinc-500 mb-4">Optional. This information is included in the output XLSX.</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {(Object.keys(metadata) as (keyof typeof metadata)[]).map((field) => (
                                    <div key={field}>
                                        <label className="block text-xs text-zinc-400 mb-1 capitalize">{field.replace(/_/g, " ")}</label>
                                        <input type="text" value={metadata[field]}
                                            onChange={(e) => setMetadata((prev) => ({ ...prev, [field]: e.target.value }))}
                                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm focus:ring-2 focus:ring-red-500/50 focus:outline-none" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setStep("properties")}
                                className="px-5 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition">
                                ← Back
                            </button>
                            <button onClick={() => setStep("generate")}
                                className="px-6 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-500 transition">
                                Next: Generate XLSX →
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 5: Generate */}
                {step === "generate" && (
                    <div className="space-y-6">
                        {/* QC Panel — also shown on Generate step */}
                        <QCPanel />

                        <div className="flex items-center justify-center py-12">
                            <div className="text-center space-y-6 max-w-md">
                                <div className="text-6xl">{generating ? "⏳" : "📥"}</div>
                                <h2 className="text-2xl font-semibold">
                                    {generating ? "Generating XLSX..." : "Ready to Generate"}
                                </h2>
                                <p className="text-zinc-500">
                                    {generating
                                        ? "Applying unit conversions and writing to GloSIS template. Please wait..."
                                        : `${data?.rows.length} rows × ${selectedProps.length} properties will be harmonized.`}
                                </p>
                                {!generating && (
                                    <div className="space-y-3">
                                        <button onClick={handleGenerate}
                                            className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-semibold text-lg hover:bg-emerald-500 transition shadow-lg shadow-emerald-900/30">
                                            Generate & Download XLSX
                                        </button>
                                        <button onClick={() => setStep("metadata")}
                                            className="block mx-auto text-sm text-zinc-500 hover:text-zinc-300 transition">
                                            ← Go back
                                        </button>
                                    </div>
                                )}
                                {generating && (
                                    <svg className="animate-spin h-8 w-8 mx-auto text-emerald-500" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
