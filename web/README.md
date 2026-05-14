# Log Analyzer Web UI

Next.js + React frontend for the log analyzer tool, calling FastAPI backend at `localhost:8000`.

## Setup

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000

## Architecture

- **Backend API**: `services/api.py` (FastAPI, runs on :8000)
- **Frontend**: Next.js (React + TypeScript, runs on :3000)
- **Proxy**: `next.config.ts` rewrites `/api/*` → `http://localhost:8000/api/*`

## Tech Stack

- Next.js 16, React 18, TypeScript 5.3
- Custom CSS with CSS variables (no Tailwind)
- Token-based auth (Bearer token header)

## Components

- **`components/LogTable.tsx`** — Filterable table of logs with level/status badges
- **`components/Filters.tsx`** — Level, service, status, sort, anomaly-only filters
- **`components/LogDetail.tsx`** — Modal showing full log detail + AI explanation
- **`components/AssignmentPanel.tsx`** — Quick assign panel (team dashboard only)

## Pages

### `/log-analyzer/team`

Team-wide dashboard with:
- Stats cards (high anomaly count, unreviewed, in review, resolved)
- Filters + sorting
- Quick assign panel to assign high-anomaly logs to team members
- Log table with click-to-detail

### `/log-analyzer/my-logs`

Individual engineer dashboard with:
- Engineer selector (alice, bob, carol, david)
- Stats for that engineer's assigned logs
- Log table (engineer's logs only)
- Status workflow (unreviewed → in_review → resolved)

## API Integration

See `lib/api.ts` for all fetch wrappers. Default token is `Bearer token-ops` (ops_engineer role).

To use different roles, pass a token option:
```typescript
getTeamLogs(filters, "Bearer token-manager") // support_manager role
```

## Running Both Services

```bash
# Terminal 1: FastAPI backend
cd sandbox
py -m uvicorn services.api:app --reload --port 8000

# Terminal 2: Next.js frontend
cd sandbox/web
npm run dev
```

Then visit http://localhost:3000/log-analyzer/team
