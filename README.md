# GloSIS ETL (JavaScript / Next.js)

`glosis-etl-js` is a standalone, purely JavaScript-based port of the GloSIS Extract, Transform, and Load (ETL) application. It removes the previous RShiny dependencies, offering a modern web interface built on [Next.js](https://nextjs.org/) and a containerized PostGIS database.

This application provides tools for standardizing soil data templates, harmonizing unit conversions, viewing analytical properties on spatial maps, and injecting datasets directly into the core PostgreSQL GloSIS database.

## 🚀 Standalone Docker Deployment (Production)

To deploy the application and its dedicated PostgreSQL database independently, you can use the built-in `docker-compose.yml` architecture. This will spin up two linked containers: the `postgis` database (port 5442) and the `glosis-etl-js` Node.js server (port 3000).

### 1. Configure Environment Variables
Copy the provided `.env.example` into a local `.env` and modify the administrative passwords (if necessary):
```bash
cp .env.example .env
```

### 2. Build and Run
With the environment file in place, spin up the Docker network:
```bash
docker-compose up -d --build
```
*(Note: Because the `init-scripts` directory containing the `glosis-db_latest.sql` is tracked in this repository, the PostGIS container will automatically scaffold the latest GloSIS schemas upon first launch!)*

The unified platform will now be available at [http://localhost:3000](http://localhost:3000).

---

## 💻 Local Development

If you wish to run the Next.js frontend locally for active development without containerizing the Node application:

### 1. Start the Database
You still need the PostgreSQL database running. Use the Docker composition to start only the `postgis` container:
```bash
docker-compose up -d postgis
```

### 2. Install Dependencies
Switch to your local Node environment and install the required packages:
```bash
npm install
```

### 3. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. The application will hot-reload as you modify files in `/src`.

## Architecture Overview
- **Framework:** Next.js (App Router)
- **Styling:** Vanilla CSS & TailwindCSS
- **Database:** PostgreSQL (with PostGIS extensions, defined in `docker-compose.yml`)
- **Core APIs:** `/src/app/api/...` handles database querying, Harmonization parsing, and DB injection streams.
- **Client Components:** `/src/components/...` contains the dynamic interactive views (e.g., Leaflet mapping).
