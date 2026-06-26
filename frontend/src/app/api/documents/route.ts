/** Document list (self-contained). Like the real backend, the list itself is not
 * RBAC-filtered - access is enforced at chunk retrieval - so a restricted document
 * is visible in the list but its contents are gated. Applies in-place re-tiering. */

import { DEMO_DOCS } from "@/lib/demo/corpus";
import { getOverrides } from "@/lib/demo/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const overrides = getOverrides(req);
  const docs = DEMO_DOCS.map((d) => {
    const o = overrides[d.id];
    return {
      id: d.id,
      source_id: d.source_id,
      title: d.title,
      uri: null,
      n_pages: 1,
      sensitivity: o?.sensitivity ?? d.sensitivity,
      classification_reason: d.classification_reason,
      auto_classified: d.auto_classified,
      created_at: d.created_at,
    };
  });
  return Response.json(docs);
}
