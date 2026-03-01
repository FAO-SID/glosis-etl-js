import Link from "next/link";

const apps = [
  {
    title: "Harmonization",
    desc: "Convert and harmonize raw soil datasets (CSV/XLSX) into the GloSIS ISO-28258 template format.",
    href: "/harmonization",
    icon: "🔄",
    status: "Available",
  },
  {
    title: "Standardization",
    desc: "Inject harmonized data into a PostgreSQL/PostGIS database following the ISO 28258 schema.",
    href: "/standardization",
    icon: "📥",
    status: "Available",
  },
  {
    title: "Data Viewer",
    desc: "Explore and visualize ingested soil data with interactive maps, tables, and property distributions.",
    href: "/dataviewer",
    icon: "🗺️",
    status: "Available",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/30 via-red-900/20 to-zinc-950" />
        <div className="relative max-w-5xl mx-auto px-6 py-20 text-center space-y-6">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            Glo<span className="text-red-500">SIS</span> ETL Platform
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Soil Data Harmonization, Standardization &amp; Visualization
            <br />
            <span className="text-sm text-zinc-500">
              A containerized platform for transforming heterogeneous soil datasets into the{" "}
              <strong className="text-zinc-300">ISO 28258</strong> standard.
            </span>
          </p>
          <div className="flex items-center justify-center gap-3 text-xs text-zinc-600">
            <span className="px-2 py-1 bg-zinc-800 rounded">Node.js</span>
            <span className="px-2 py-1 bg-zinc-800 rounded">Next.js</span>
            <span className="px-2 py-1 bg-zinc-800 rounded">PostgreSQL + PostGIS</span>
            <span className="px-2 py-1 bg-zinc-800 rounded">Docker</span>
          </div>
        </div>
      </header>

      {/* App Cards */}
      <main className="max-w-5xl mx-auto px-6 pb-20 -mt-4">
        <div className="grid md:grid-cols-3 gap-6">
          {apps.map((app) => (
            <Link
              key={app.title}
              href={app.href}
              className={`group block p-6 rounded-2xl border transition-all duration-300 ${
                app.status === "Available"
                  ? "bg-zinc-900 border-zinc-700 hover:border-red-500/50 hover:shadow-xl hover:shadow-red-900/10 hover:-translate-y-1"
                  : "bg-zinc-900/50 border-zinc-800 opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="text-4xl mb-4">{app.icon}</div>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-lg font-semibold">{app.title}</h2>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    app.status === "Available"
                      ? "bg-emerald-900/50 text-emerald-400"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {app.status}
                </span>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">{app.desc}</p>
            </Link>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-zinc-600">
          <div>
            <strong className="text-zinc-400">Global Soil Partnership</strong> — Food and
            Agriculture Organization of the United Nations (FAO)
          </div>
          <div>
            <a
              href="https://github.com/FAO-SID/glosis-etl-js"
              className="hover:text-zinc-300 transition"
              target="_blank"
              rel="noopener"
            >
              GitHub →
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
