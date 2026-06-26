/** Ingestion is a no-op in the demo - the corpus is bundled. */

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return Response.json({
    status: "success",
    preset: name,
    documents: 0,
    chunks_inserted: 0,
    chunks_skipped: 6,
    detail: "The demo corpus is already loaded; ingestion runs in the full local stack.",
  });
}
