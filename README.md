# Maintenance AI Pro 1.0

Production-foundation build for multifamily/residential field diagnostics. This package consolidates the V1–V1.7 prototype work into one deployable application.

## Included
- Complaint-first workflows for HVAC, electrical, plumbing, refrigerators, washers, dryers, dishwashers, water heaters, and building systems.
- Structured field readings including RLA/LRA, running amps, pressures, saturation temperatures, line temperatures, superheat, subcooling, Delta-T, static pressure, capacitors, voltages, resistance, and trade-specific measurements.
- Deterministic evidence-based diagnostic engine with confidence, supporting/conflicting evidence, next test, and fastest disproof.
- Conversational Senior Tech AI interface with voice dictation and reading extraction.
- Smart Scan nameplate OCR using Tesseract.
- PDF tech-sheet indexing and verified official-domain manual workflow.
- Field Case Intelligence using completed repairs as supporting evidence.
- Professional work-order closing note generator.
- Persistent SQLite case database with browser-local fallback.
- PWA/offline application shell.
- Docker deployment files.

## Run locally
1. Install Python 3.11+ and Tesseract OCR.
2. `pip install -r requirements.txt`
3. `python server.py`
4. Open `http://127.0.0.1:8080`

The SQLite database is created automatically at `data/maintenance_ai.db` unless `MAINT_AI_DB` is set.

## Docker
`docker compose up --build`

The compose file persists the SQLite database in a named volume.

## Security
The default host is `127.0.0.1`. If you expose the app outside the local device/network, put it behind HTTPS/reverse proxy and set `MAINT_AI_API_TOKEN` to a long random secret. Static paths are restricted to the application root, manual auto-fetching accepts only HTTPS URLs on recognized manufacturer domains, and uploads are size-limited.

## Data model
Completed cases persist server-side in SQLite. When the server cannot be reached, the UI falls back to browser localStorage so field notes are not immediately lost. Once the server is available again, local JSON can be imported through the API.

## Production boundary
This is a deployable single-tenant production foundation, not yet a cloud SaaS. Multi-user accounts, managed cloud database/object storage, push sync across multiple devices, and hosted AI-provider credentials should be added when deploying for multiple technicians/properties.

## Test
`python test_production.py`


## Hosted deployment
A Render-specific production configuration is included in `render.yaml`. See `DEPLOY_RENDER.md` for the deployment flow. The hosted build uses a generated API access token and a persistent disk for SQLite.
