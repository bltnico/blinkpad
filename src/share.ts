import { SHARE_QUERY_PARAM } from "./constants.ts";

const SHARE_ENDPOINT = "/.netlify/functions/share";

type ShareResponse = {
  key: string;
  expiresAt?: number;
  createdAt?: number;
};

export type ShareLink = ShareResponse & {
  url: string;
};

async function fetchShareKey(markup: string): Promise<ShareResponse> {
  const response = await fetch(SHARE_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ html: markup }),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    const fallbackMessage = `Share request failed (${response.status})`;
    throw new Error(fallbackMessage);
  }

  if (!response.ok) {
    const message =
      typeof (payload as { error?: unknown })?.error === "string"
        ? (payload as { error: string }).error
        : `Share request failed (${response.status})`;
    throw new Error(message);
  }

  const { key, expiresAt, createdAt } = payload as ShareResponse;
  if (typeof key !== "string" || !key) {
    throw new Error("Invalid share response.");
  }
  return { key, expiresAt, createdAt };
}

function buildShareUrl(key: string): string {
  const url = new URL(`${window.location.origin}${window.location.pathname}`);
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("s");
  if (slug) {
    url.searchParams.set("s", slug);
  }
  url.searchParams.set(SHARE_QUERY_PARAM, key);
  return url.toString();
}

export async function createShareLink(markup: string): Promise<ShareLink> {
  const { key, expiresAt, createdAt } = await fetchShareKey(markup);
  return {
    key,
    url: buildShareUrl(key),
    expiresAt,
    createdAt,
  };
}
