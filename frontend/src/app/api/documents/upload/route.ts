/** Uploads need the real ingestion pipeline (PDF parse, embeddings, pgvector), which
 * the serverless demo does not run. Return a clear, friendly message. */

export const runtime = "nodejs";

export async function POST() {
  return new Response(
    "Uploads are disabled in the hosted demo (they need the embedding + pgvector backend). " +
      "Explore the bundled corpus instead, or run the full stack locally from the repo.",
    { status: 400 }
  );
}
