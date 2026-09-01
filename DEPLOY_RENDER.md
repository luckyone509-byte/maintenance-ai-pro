# Deploy Maintenance AI Pro 1.0 on Render

This package is configured for a Docker-based Render Web Service with a persistent SQLite disk.

## Required deployment flow
1. Put the contents of this folder in a private GitHub or GitLab repository.
2. In Render, create a **Blueprint** and connect that repository. Render will detect `render.yaml`.
3. Review the resources and deploy the Blueprint. The configuration uses the Virginia region, Docker runtime, a paid compute plan, a 1 GB persistent disk mounted at `/app/data`, and `/api/health` as the health check.
4. Render generates `MAINT_AI_API_TOKEN` automatically. In the Render service dashboard, copy that secret value.
5. Open the Render URL. The first API request asks for the Maintenance AI Pro access key. Paste the generated token. It is stored only in that browser's localStorage and then sent as a Bearer token for `/api/*` requests.
6. Test by creating and saving a case, refreshing the page, and confirming the case remains in History.

## Important
- Do not publish the repository with secrets. The access key is generated on Render, not stored in `render.yaml`.
- The SQLite database persists because it lives at `/app/data/maintenance_ai.db` on the attached disk.
- If you clear browser storage, the app will ask for the access key again.
- If you rotate `MAINT_AI_API_TOKEN` in Render, existing browsers will need the new key.
