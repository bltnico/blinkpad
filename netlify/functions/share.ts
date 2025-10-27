import {
  redis,
  jsonResponse,
  ensureRateLimit,
  createChecksum,
  SHARE_TTL_SECONDS,
  getClientIp,
} from "./_utils";

type SharePayload = {
  html: string;
  createdAt: number;
};

type ErrorResponse = {
  error: string;
  detail?: string;
};

async function handlePost(request: Request) {
  if (!redis) {
    return jsonResponse<ErrorResponse>(500, {
      error: "Server not configured.",
      detail: "Missing Upstash credentials.",
    });
  }

  const clientIp = getClientIp(request);
  const rateLimitResult = await ensureRateLimit(clientIp);
  if (!rateLimitResult.ok) {
    return jsonResponse<ErrorResponse>(429, {
      error: "Too many requests.",
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse<ErrorResponse>(400, {
      error: "Invalid JSON body.",
    });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { html?: unknown }).html !== "string"
  ) {
    return jsonResponse<ErrorResponse>(400, {
      error: "Missing note payload.",
    });
  }

  const rawHtml = (body as { html: string }).html;
  const trimmed = rawHtml.trim();

  if (!trimmed) {
    return jsonResponse<ErrorResponse>(400, {
      error: "Note payload is empty.",
    });
  }

  if (trimmed.length > 250_000) {
    return jsonResponse<ErrorResponse>(413, {
      error: "Note payload is too large.",
    });
  }

  const checksum = createChecksum(trimmed);
  const now = Date.now();
  const sharePayload: SharePayload = { html: trimmed, createdAt: now };
  const serializedPayload = JSON.stringify(sharePayload);

  try {
    const wasInserted = await redis.set(checksum, serializedPayload, {
      ex: SHARE_TTL_SECONDS,
      nx: true,
    });

    if (wasInserted === null) {
      await redis.expire(checksum, SHARE_TTL_SECONDS);
      const existing = await redis.get<SharePayload>(checksum);
      const expiresAt = now + SHARE_TTL_SECONDS * 1000;
      return jsonResponse(200, {
        key: checksum,
        expiresAt,
        createdAt: existing?.createdAt ?? now,
      });
    }

    return jsonResponse(200, {
      key: checksum,
      expiresAt: now + SHARE_TTL_SECONDS * 1000,
      createdAt: now,
    });
  } catch (error) {
    console.error("Unable to store shared note", error);
    return jsonResponse<ErrorResponse>(502, {
      error: "Failed to store note.",
    });
  }
}

async function handleGet(request: Request) {
  if (!redis) {
    return jsonResponse<ErrorResponse>(500, {
      error: "Server not configured.",
      detail: "Missing Upstash credentials.",
    });
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!key) {
    return jsonResponse<ErrorResponse>(400, {
      error: "Missing share key.",
    });
  }

  const clientIp = getClientIp(request);
  const rateLimitResult = await ensureRateLimit(clientIp);
  if (!rateLimitResult.ok) {
    return jsonResponse<ErrorResponse>(429, {
      error: "Too many requests.",
    });
  }

  try {
    const entry = (await redis.getdel<SharePayload>(key)) ?? undefined;

    if (!entry) {
      return jsonResponse<ErrorResponse>(404, {
        error: "Share key not found.",
      });
    }

    return jsonResponse(200, {
      html: entry.html,
      createdAt: entry.createdAt,
    });
  } catch (error) {
    console.error("Unable to retrieve shared note", error);
    return jsonResponse<ErrorResponse>(502, {
      error: "Failed to fetch note.",
    });
  }
}

const allowedMethods = new Set(["GET", "POST"]);

export default async function handler(request: Request): Promise<Response> {
  if (!allowedMethods.has(request.method)) {
    return new Response(null, {
      status: 405,
      headers: { allow: "GET, POST" },
    });
  }

  if (request.method === "POST") {
    return handlePost(request);
  }

  return handleGet(request);
}
