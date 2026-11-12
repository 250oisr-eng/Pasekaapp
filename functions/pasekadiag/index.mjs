const allowedOrigin = "https://250oisr-eng.github.io";
const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
let cachedJwks = null;
let cachedAt = 0;

function json(data, status, origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin === allowedOrigin ? allowedOrigin : "null",
    "vary": "Origin",
  };
  return new Response(JSON.stringify(data), { status, headers });
}

function decodePart(part) {
  const s = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = s + "=".repeat((4 - s.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
function decodeJson(part) {
  return JSON.parse(new TextDecoder().decode(decodePart(part)));
}
async function getJwks() {
  if (cachedJwks && Date.now() - cachedAt < 5 * 60_000) return cachedJwks;
  if (!jwksUrl) throw new Error("NEON_AUTH_JWKS_URL is not configured");
  const response = await fetch(jwksUrl, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("JWKS endpoint returned HTTP " + response.status);
  cachedJwks = await response.json();
  cachedAt = Date.now();
  return cachedJwks;
}
async function verifyJwt(token) {
  if (!authBaseUrl) throw new Error("NEON_AUTH_BASE_URL is not configured");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");
  const header = decodeJson(parts[0]);
  const payload = decodeJson(parts[1]);
  if (header.alg !== "EdDSA") throw new Error("Unexpected JWT algorithm");
  const issuer = new URL(authBaseUrl).origin;
  if (payload.iss !== issuer) throw new Error("JWT issuer mismatch");
  if (typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000) throw new Error("JWT expired or missing exp");
  if (payload.nbf && payload.nbf > Date.now() / 1000) throw new Error("JWT not active yet");
  const jwks = await getJwks();
  const key = (jwks.keys || []).find(k => k.kid === header.kid && k.kty === "OKP" && k.crv === "Ed25519");
  if (!key) throw new Error("Signing key not found in JWKS");
  const publicKey = await crypto.subtle.importKey("jwk", key, { name: "Ed25519" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    publicKey,
    decodePart(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1])
  );
  if (!valid) throw new Error("JWT signature invalid");
  if (!payload.sub) throw new Error("JWT subject missing");
  return payload.sub;
}

export default {
  async fetch(request) {
    const origin = request.headers.get("origin") || "";
    if (request.method === "OPTIONS") {
      if (origin !== allowedOrigin) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": allowedOrigin,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-max-age": "86400",
          "vary": "Origin"
        }
      });
    }
    if (origin !== allowedOrigin) return json({ error: "Forbidden origin" }, 403, origin);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
    const auth = request.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) return json({ error: "Missing bearer token" }, 401, origin);
    try {
      const userId = await verifyJwt(auth.slice(7).trim());
      return json({ ok: true, authenticated: true, userId }, 200, origin);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "JWT verification failed";
      return json({ ok: false, error: reason }, 401, origin);
    }
  }
};
