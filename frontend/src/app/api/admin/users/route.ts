/** Demo users for the Admin page (read-only in the hosted demo). */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USERS = [
  { id: "u1", username: "viewer", roles: ["viewer"], is_active: true, created_at: "2026-06-20T12:00:00.000Z" },
  { id: "u2", username: "analyst", roles: ["analyst"], is_active: true, created_at: "2026-06-20T12:00:00.000Z" },
  { id: "u3", username: "admin", roles: ["admin"], is_active: true, created_at: "2026-06-20T12:00:00.000Z" },
];

export async function GET() {
  return Response.json(USERS);
}

export async function POST() {
  // User management runs against the real auth backend; the demo is read-only.
  return new Response(
    "User management is read-only in the hosted demo. Run the full stack locally to create users.",
    { status: 400 }
  );
}
