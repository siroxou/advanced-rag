export const runtime = "nodejs";

export async function PUT() {
  return new Response("Read-only in the hosted demo.", { status: 400 });
}
