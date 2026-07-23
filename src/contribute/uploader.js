// ======================================================
// BLACKBOX LAB — CONTRIBUTION UPLOADER
//
// Gzips the anonymized payload and POSTs it to the
// community ingest endpoint. Fire-and-forget: failures
// never interrupt the pilot, they just log to console.
// ======================================================

async function gzipJson(payload) {
  const json = JSON.stringify(payload);

  if (typeof CompressionStream === "undefined") {
    return { body: json, encoding: null };
  }

  const stream = new Blob([json])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const body = await new Response(stream).blob();

  return { body, encoding: "gzip" };
}

export async function uploadContribution(endpoint, payload) {
  const { body, encoding } = await gzipJson(payload);

  const headers = { "Content-Type": "application/json" };
  if (encoding) {
    headers["Content-Encoding"] = encoding;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body
  });

  return { ok: response.ok, status: response.status };
}
