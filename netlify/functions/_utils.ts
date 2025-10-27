import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const SHARE_TTL_SECONDS = 60 * 60 * 24;
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
export const redis = new Redis({ url: redisUrl, token: redisToken });

export const rateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "share:ip",
});

export function jsonResponse<T>(status: number, payload: T): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function ensureRateLimit(
  ip: string | undefined
): Promise<{ ok: boolean; reset?: number }> {
  if (!ip) {
    return { ok: true };
  }
  if (!rateLimiter) {
    return { ok: true };
  }
  try {
    const outcome = await rateLimiter.limit(ip);
    return { ok: outcome.success, reset: outcome.reset };
  } catch (error) {
    console.warn("Rate limiter failure", error);
    return { ok: true };
  }
}

const encoder = new TextEncoder();
export function createChecksum(html: string): string {
  return createHash("sha256").update(encoder.encode(html)).digest("hex");
}

export function getClientIp(request: Request): string {
  if (process.env.NODE_ENV === "development") {
    return "localhost";
  }

  let ip: string | null;
  const nfIp = request.headers.get("x-nf-client-connection-ip");
  const xff = request.headers.get("x-forwarded-for");
  ip = nfIp || (xff && xff.split(",")[0].trim());
  if (ip) {
    return ip;
  }

  ip = "unknown";
  return ip;
}
