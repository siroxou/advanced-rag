/** Chunk preview, RBAC-gated by the caller's roles (fail-closed like RLS: a role
 * without access gets an empty list, never the content). */

import { DEMO_CHUNKS } from "@/lib/demo/corpus";
import { getOverrides, getRoles } from "@/lib/demo/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const roleSet = new Set(getRoles(req));
  const overrides = getOverrides(req);

  const chunks = DEMO_CHUNKS.filter((c) => c.doc_id === id)
    .filter((c) => {
      const allowed = overrides[c.doc_id]?.allowed_roles ?? c.allowed_roles;
      return allowed.some((r) => roleSet.has(r));
    })
    .map((c) => ({
      id: c.id,
      page: c.page,
      chunk_index: c.chunk_index,
      content: c.content,
      citation_anchor: c.citation_anchor,
    }));

  return Response.json(chunks);
}
