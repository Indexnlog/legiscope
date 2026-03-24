---
paths:
  - "dashboard-next/**"
---
# Dashboard Rules

- industry_signals table is the shared data contract — field changes break the frontend
- TypeScript types in lib/types.ts must match Supabase schema exactly
- The dashboard is read-only — it never writes to the database
- URL parameter ?ksic=XXX routes to drilldown tab (pdeck integration point)
- Use Supabase RPC functions defined in supabase_rpc.sql for complex queries
- Test with `npm run dev` inside dashboard-next/ before committing
- Tailwind CSS for styling — do not add inline styles
