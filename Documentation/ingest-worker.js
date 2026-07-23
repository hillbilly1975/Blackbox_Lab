// ======================================================
// BLACKBOX LAB — LOG INGEST WORKER (Cloudflare)
//
// Paste-ready Cloudflare Worker: accepts contributed
// logs from the app and stores them in a private R2
// bucket. Setup guide: ingest-endpoint-setup.md
// ======================================================

const MAX_BODY_BYTES = 40 * 1024 * 1024; // 40 MB gzipped

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Blackbox Lab ingest", { status: 200 });
    }

    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > MAX_BODY_BYTES) {
      return new Response("too large", { status: 413 });
    }

    const body = await request.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MAX_BODY_BYTES) {
      return new Response("bad body", { status: 400 });
    }

    // Object key: date prefix + random id. No IP, no
    // user identifier — the payload is all there is.
    const id = crypto.randomUUID();
    const day = new Date().toISOString().slice(0, 10);
    const gzipped =
      request.headers.get("Content-Encoding") === "gzip" ? ".gz" : "";

    await env.LOGS.put(`${day}/${id}.json${gzipped}`, body);

    return new Response("thanks", { status: 200 });
  }
};
