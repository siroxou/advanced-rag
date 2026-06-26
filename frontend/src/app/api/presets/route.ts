/** Corpus presets (informational in the demo - the bundled corpus is already loaded). */

export const runtime = "nodejs";

export async function GET() {
  return Response.json([
    {
      name: "acme-knowledge-base",
      kind: "bundled",
      dataset: "in-app demo corpus",
      description: "Six Acme Analytics documents across public, internal, and restricted tiers - already loaded so you can try role-based access right away.",
      roles: ["viewer", "analyst", "admin"],
      sensitivity: "mixed",
      default_limit: 6,
      notes: "Live ingestion (PDF -> embeddings -> pgvector) runs in the full local stack.",
    },
  ]);
}
