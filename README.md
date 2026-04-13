<!--
<p align="center">
  <img src="public/fao_logo1.png" alt="FAO Logo" height="120">
</p>
-->

<h1 align="center">GloSIS ETL Platform</h1>

<p align="center">
  <strong>Soil Data Harmonization, Standardization &amp; Visualization</strong><br>
  A modern, standalone Next.js platform for transforming heterogeneous soil datasets into the <a href="https://www.fao.org/global-soil-partnership/areas-of-work/soil-information-and-data/en/">GloSIS ISO-28258</a> standard.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-green?logo=nodedotjs" alt="Node Version">
  <img src="https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs" alt="Next.js">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&amp;logoColor=white" alt="Docker Compose">
  <img src="https://img.shields.io/badge/PostgreSQL-PostGIS-336791?logo=postgresql&amp;logoColor=white" alt="PostGIS">
  <img src="https://img.shields.io/badge/Platform-amd64%20%7C%20arm64-orange" alt="Multi-Platform">
</p>

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Database Initialization](#database-initialization)
- [Configuration](#configuration)
- [Applications](#applications)
- [Project Structure](#project-structure)
- [Database Overview](#database-overview)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Contact](#contact)

---

## Overview

The **GloSIS ETL Platform** is a unified Next.js web application designed to support the full lifecycle of soil data management following the **ISO 28258** domain model:

1. **Harmonization** — Convert and harmonize raw soil datasets (CSV/XLSX) into the GloSIS template format.
2. **Standardization** — Inject harmonized data into a PostgreSQL/PostGIS database following the ISO 28258 schema.
3. **Data Viewer** — Explore and visualize ingested soil data with interactive maps, tables, and property distributions.

The application runs inside Docker containers alongside a PostGIS database, providing a reproducible, self-contained, and blazingly fast environment.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
│                                                          │
│  ┌─────────────────────┐    ┌─────────────────────────┐  │
│  │ glosis-etl-js       │    │    glosis-db            │  │
│  │ (Next.js App)       │───▶│    (PostGIS 17-3.5)     │  │
│  │                     │    │                         │  │
│  │  ┌───────────────┐  │    │  • ISO-28258 Schema     │  │
│  │  │ Landing Page  │  │    │  • Spatial Queries      │  │
│  │  │ (/)           │  │    │  • Persistent Storage   │  │
│  │  ├───────────────┤  │    └─────────────────────────┘  │
│  │  │ /harmonization│  │                                 │
│  │  ├───────────────┤  │    ┌─────────────────────────┐  │
│  │  │/standardizat. │  │    │  pgAdmin (optional)     │  │
│  │  ├───────────────┤  │    │  Profile: "admin"       │  │
│  │  │ /viewer       │  │    └─────────────────────────┘  │
│  │  └───────────────┘  │                                 │
│  └─────────────────────┘                                 │
└──────────────────────────────────────────────────────────┘
```

| Service         | Port   | Description                                |
|-----------------|--------|--------------------------------------------|
| `glosis-etl-js` | `3000` | Landing page + Next.js application         |
| `postgis`       | `5442` | PostgreSQL with PostGIS (mapped to host)   |
| `pgadmin`       | `5050` | pgAdmin web UI (optional, `--profile admin`) |

---

## Prerequisites

- **Docker Desktop** >= 4.0 (or Docker Engine + Docker Compose v2)
  - [Download for macOS](https://docs.docker.com/desktop/install/mac-install/)
  - [Download for Windows](https://docs.docker.com/desktop/install/windows-install/)
  - [Download for Linux](https://docs.docker.com/desktop/install/linux/)
- **Git** (to clone the repository)
- Minimum **4 GB RAM** allocated to Docker
- Minimum **2 GB disk space** (Docker images + database)

> **Note**: The platform supports both **Intel/AMD (amd64)** and **Apple Silicon (arm64)** architectures natively.

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/FAO-SID/glosis-etl-js.git
cd glosis-etl-js
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` to customize your database credentials (defaults work out of the box):

```env
POSTGRES_DB=glosis
POSTGRES_USER=glosis
POSTGRES_PASSWORD=glosis
```

> **Warning**: Change the password in production environments!

### 3. Build and Start

Spin up the entire application stack:

```bash
docker compose up -d --build
```

### 4. Access the Platform

| Application      | URL                                  |
|------------------|--------------------------------------|
| **Landing Page** | http://localhost:3000                 |
| **Harmonization**| http://localhost:3000/harmonization   |
| **Standardization** | http://localhost:3000/standardization |
| **Data Viewer**  | http://localhost:3000/viewer          |

---

## Database Initialization (Crucial Step)

If this is your first time running the Docker containers, the PostgreSQL database is created but its schema is initially **empty (0 tables)**. You must properly initialize the core tables that map to the ISO 28258 domain structure before beginning any data standardization.

To do this correctly:
1. Navigate to the **[Standardization Module](http://localhost:3000/standardization)** in the running application.
2. In the Database section, **first remove the existing empty `glosis` database** using the provided interface options.
3. Click the **+ Create** button to build the database from scratch. 
4. The application will pull the `glosis-db_latest.sql` definition file directly from the central FAO repository and execute it. 
5. Wait for the success notification confirming that **189 specific spatial/core tables** have been successfully created and linked.

Once this is complete, your system is ready for data injection.

---

## Configuration

### Environment Variables (`.env`)

| Variable             | Default   | Description                          |
|----------------------|-----------|--------------------------------------|
| `POSTGRES_DB`        | `glosis`  | Database name                        |
| `POSTGRES_USER`      | `glosis`  | Database admin username              |
| `POSTGRES_PASSWORD`  | `glosis`  | Database admin password              |
| `DB_HOST`            | `postgis` | Internal Docker host resolution      |
| `DB_PORT`            | `5432`    | Internal PostgreSQL port             |

### Optional: pgAdmin

To enable the pgAdmin database management UI:

```bash
docker compose --profile admin up -d
```

Access at http://localhost:5050 with:
- **Email**: `admin@glosis.org`
- **Password**: `admin`

---

## Applications

The ETL encapsulates the complete data workflow across three distinct routes:

### Harmonization (`/harmonization`)
Converts raw, unstandardized soil CSV/XLSX exports from your legacy systems into the formal GloSIS data templates. Performs bulk renaming, unit conversions (e.g., mg/kg to %), and dictionary term-matching.

### Standardization (`/standardization`)
Validates harmonized template workbooks and writes the data sequentially into the PostGIS network. It handles nested dependencies automatically (Projects → Sites → Plots → Profiles → Elements → Specimens → Physical/Chemical properties).

### Data Viewer (`/viewer`)
A rich Leaflet-based spatial dashboard allowing administrators to browse ingested metrics on a global map, perform spatial selections, and export aggregated summaries.

---

## Project Structure

```
glosis-etl-js/
├── README.md                      # This documentation
├── Dockerfile                     # Multi-stage Next.js optimized runner
├── docker-compose.yml             # Orchestration block
├── .env.example                   # Environment configuration template
│
├── src/
│   ├── app/                       # Next.js App Router endpoints
│   │   ├── api/                   # Serverless routes for DB querying/ingestion
│   │   ├── harmonization/         # Harmonization frontend view
│   │   ├── standardization/       # Standardization frontend view
│   │   └── viewer/                # Data Viewer frontend view
│   │
│   ├── components/                # Reusable React components (UI, Maps)
│   ├── lib/                       # Core ETL logic, schema validators, SQL mappers
│   └── styles/                    # Global Tailwind CSS definitions
│
├── public/                        # Static assets (images, template files)
│
└── init-scripts/                  # Docker Postgres initialization hooks
```

---

## Database Overview

### Schema Structure

The database closely adheres to the **ISO 28258** domain guidelines enforced by the global [GloSIS project](https://github.com/FAO-SID/GloSIS).

### Key Storage Tables

| Schema | Table | Description |
|--------|-------|-------------|
| `core` | `project` | Parent research initiatives |
| `core` | `site` | Geographical sampling zones |
| `core` | `plot` | Explicit soil sampling plots (geometry-enabled) |
| `core` | `profile` | Detailed top-to-bottom soil profiles |
| `core` | `element` | Individual soil horizons/layers |
| `core` | `specimen` | Laboratory specimen identifiers |
| `core` | `observation_phys_chem` | Global physical/chemical dictionary terms |
| `core` | `result_phys_chem` | Quantitative analytical readings |

---

## Development

If you wish to bypass the Dockerized Next.js interface to develop the frontend actively, run the application purely through Node.js while retaining the Dockerized database.

### Running Apps Locally

1. Start only the database layer:
   ```bash
   docker compose up -d postgis
   ```

2. Point your local `.env` DB details to localhost.

3. Install requirements and start the Next.js hot-loader:
   ```bash
   npm install
   npm run dev
   ```

4. The development console runs at `http://localhost:3000`. Changes to `/src` will trigger a live client refresh.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Prisma/DB Connection refused** | Wait ~30s for the PostGIS container health-check to resolve. The DB must be fully initialized before queries execute. |
| **"Empty Tables" during injection** | Ensure you have followed the **Database Initialization** step properly; an empty docker volume requires the `+ Create` flow. |
| **Port 3000/5442 in use** | If services overlap, re-map your host ports inside `docker-compose.yml` (e.g., `"3001:3000"`). |

---

## License

This project is developed by the **Global Soil Partnership** at the **Food and Agriculture Organization of the United Nations (FAO)**.

---

## Contact

- **Author**: Luis Rodriguez Lado — [luis.rodriguezlado@fao.org](mailto:luis.rodriguezlado@fao.org)
- **Organization**: [FAO Global Soil Partnership](https://www.fao.org/global-soil-partnership/)
- **Repository**: [github.com/FAO-SID/glosis-etl-js](https://github.com/FAO-SID/glosis-etl-js)
