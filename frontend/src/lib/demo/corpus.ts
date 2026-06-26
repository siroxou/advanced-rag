/**
 * Bundled demo corpus for the self-contained Vercel demo.
 *
 * Mirrors the shape the real backend serves (documents + role-tagged chunks) so the
 * UI is unchanged. Curated across sensitivity tiers so role-based access control is
 * immediately visible: a viewer is refused the restricted board minutes that an
 * admin can retrieve and cite.
 */

export type DemoChunk = {
  id: string;
  doc_id: string;
  source_id: string;
  title: string;
  content: string;
  page: number;
  chunk_index: number;
  citation_anchor: string;
  allowed_roles: string[];
  sensitivity: string;
};

export type DemoDoc = {
  id: string;
  source_id: string;
  title: string;
  sensitivity: string;
  allowed_roles: string[];
  classification_reason: string | null;
  auto_classified: boolean;
  created_at: string;
};

const PUBLIC = ["viewer", "analyst", "admin"];
const INTERNAL = ["analyst", "admin"];
const RESTRICTED = ["admin"];

type Seed = {
  id: string;
  title: string;
  sensitivity: string;
  roles: string[];
  reason: string | null;
  auto: boolean;
  chunks: string[];
};

const SEEDS: Seed[] = [
  {
    id: "acme-overview",
    title: "Acme Analytics - Company Overview",
    sensitivity: "public",
    roles: PUBLIC,
    reason: "Public marketing material, safe for everyone.",
    auto: true,
    chunks: [
      "Acme Analytics is an enterprise data platform founded in 2019 and headquartered in Austin, Texas. The company helps mid-market and enterprise customers unify data from disparate sources and answer business questions in natural language. As of 2026 it serves roughly 480 customers across financial services, healthcare, and logistics.",
      "Acme's mission is to make trustworthy analytics available to every employee without exposing data they are not cleared to see. Its flagship product pairs retrieval-augmented generation with row-level access control so answers are both grounded in company documents and respectful of each user's permissions.",
    ],
  },
  {
    id: "product-faq",
    title: "Acme Platform - Product FAQ",
    sensitivity: "public",
    roles: PUBLIC,
    reason: "Customer-facing FAQ.",
    auto: true,
    chunks: [
      "Q: How does Acme keep answers grounded? A: Every response cites the specific document chunks it used, with an inline [n] marker. If the retrieved documents do not support an answer, the assistant refuses rather than guessing.",
      "Q: Can Acme run without sending data to a third party? A: Yes. The platform runs against a local open model on a laptop for air-gapped use, and can switch to a hosted model for a cloud demo by changing a single setting. Document access is enforced by the database, not the application.",
    ],
  },
  {
    id: "q3-roadmap",
    title: "Q3 2026 Product Roadmap",
    sensitivity: "internal",
    roles: INTERNAL,
    reason: "Internal planning; not for external sharing.",
    auto: true,
    chunks: [
      "The Q3 2026 roadmap prioritizes three themes: faster hybrid retrieval, a guardrails control panel, and a managed cloud tier. The retrieval work targets a 30 percent reduction in p95 latency by moving reranking onto the GPU pool.",
      "A new operator settings surface will let administrators switch models, rotate API keys, and toggle individual guardrails at runtime without a redeploy. The managed cloud tier is scheduled for limited availability in September 2026, billed on a usage basis.",
    ],
  },
  {
    id: "oncall-runbook",
    title: "Engineering On-Call Runbook",
    sensitivity: "internal",
    roles: INTERNAL,
    reason: "Operational detail for staff only.",
    auto: true,
    chunks: [
      "When the retrieval service reports elevated error rates, first confirm the database is reachable and that row-level security policies are intact. A common cause of empty results is a missing per-request role claim, which makes the policy fail closed and return zero rows.",
      "To roll back a bad model configuration, revert the runtime setting to the previous model and clear the provider cache; no restart is required. Escalate to the platform on-call if citation accuracy drops below 80 percent on the nightly evaluation.",
    ],
  },
  {
    id: "project-cobalt",
    title: "Project Cobalt - Acquisition Board Minutes",
    sensitivity: "restricted",
    roles: RESTRICTED,
    reason: "Material non-public information; board-only.",
    auto: false,
    chunks: [
      "The board approved an acquisition budget of 4.2 million US dollars for the initiative known internally by the codename Project Cobalt. The funds are earmarked for acquiring a smaller analytics competitor to accelerate the managed cloud roadmap.",
      "The acquisition target is Helios Data, a 24-person team specializing in time-series forecasting. Diligence is expected to close in Q4 2026. This information is strictly confidential and must not be disclosed outside the board.",
      "Projected synergies include consolidating two overlapping retrieval pipelines and onboarding Helios Data's forecasting models into the Acme platform within two quarters of close.",
    ],
  },
  {
    id: "exec-comp",
    title: "Executive Compensation Summary",
    sensitivity: "restricted",
    roles: RESTRICTED,
    reason: "Contains personal and compensation data.",
    auto: false,
    chunks: [
      "The compensation committee finalized 2026 packages for the executive team. For questions, contact the committee chair at comp.committee@acme-analytics.example or by phone at 512-555-0142.",
      "Base salary adjustments average 6 percent across the executive team, with a larger equity refresh reserved for the engineering and product leads driving the managed cloud tier.",
    ],
  },
];

export const DEMO_DOCS: DemoDoc[] = SEEDS.map((s) => ({
  id: s.id,
  source_id: s.id,
  title: s.title,
  sensitivity: s.sensitivity,
  allowed_roles: s.roles,
  classification_reason: s.reason,
  auto_classified: s.auto,
  created_at: "2026-06-20T12:00:00.000Z",
}));

export const DEMO_CHUNKS: DemoChunk[] = SEEDS.flatMap((s) =>
  s.chunks.map((content, i) => ({
    id: `${s.id}-${i}`,
    doc_id: s.id,
    source_id: s.id,
    title: s.title,
    content,
    page: 1,
    chunk_index: i,
    citation_anchor: `${s.title} p.1`,
    allowed_roles: s.roles,
    sensitivity: s.sensitivity,
  }))
);

export const TIER_ROLES: Record<string, string[]> = {
  public: PUBLIC,
  internal: INTERNAL,
  confidential: RESTRICTED,
  restricted: RESTRICTED,
};
