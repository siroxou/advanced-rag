/** In-place document re-classification: persists an override in a cookie so the new
 * tier and roles cascade to chunk access immediately (a viewer loses a now-restricted
 * doc), without a database. */

import { DEMO_DOCS } from "@/lib/demo/corpus";
import { cookie, COOKIE, getOverrides } from "@/lib/demo/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { sensitivity?: string; allowed_roles?: string[] };

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = DEMO_DOCS.find((d) => d.id === id);
  if (!doc) return new Response("Document not found", { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const roles = (body.allowed_roles ?? []).map((r) => r.trim()).filter(Boolean);
  const sensitivity = body.sensitivity ?? doc.sensitivity;

  const overrides = getOverrides(req);
  overrides[id] = { sensitivity, allowed_roles: roles.length ? roles : ["viewer"] };

  return Response.json(
    {
      id: doc.id,
      source_id: doc.source_id,
      title: doc.title,
      uri: null,
      n_pages: 1,
      sensitivity,
      classification_reason: doc.classification_reason,
      auto_classified: doc.auto_classified,
      created_at: doc.created_at,
    },
    { headers: { "Set-Cookie": cookie(COOKIE.overrides, JSON.stringify(overrides)) } }
  );
}

export async function DELETE() {
  // Deletion is disabled in the bundled demo; the corpus is read-only.
  return Response.json({ status: "noop", detail: "Deletion is disabled in the hosted demo." });
}
