// Embedding layer with three backends:
//  - "voyage": calls voyage-3.5-lite by default (multilingual, fast/cheap)
//              via the Voyage AI HTTP API. Model can be overridden with
//              VOYAGE_MODEL (e.g. voyage-3, voyage-3-large).
//  - "openai": calls text-embedding-3-small (multilingual, 1536-dim)
//  - "local":  hashed character + word n-gram features (256-dim), zero deps
// Selection priority: Voyage > OpenAI > local. The picked method is
// determined per request by selectMethod() from env vars, so the demo
// works offline by default and silently lights up the better backends
// when API keys are present.

const VOYAGE_DEFAULT_MODEL = "voyage-3.5-lite";

export type EmbeddingMethod = "voyage" | "openai" | "local";

export function selectMethod(): EmbeddingMethod {
  if (process.env.VOYAGE_API_KEY) return "voyage";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "local";
}

export async function embed(
  text: string,
  method: EmbeddingMethod = selectMethod()
): Promise<number[]> {
  if (method === "voyage") return embedVoyage(text);
  if (method === "openai") return embedOpenAI(text);
  return embedLocal(text);
}

async function embedVoyage(text: string): Promise<number[]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model: process.env.VOYAGE_MODEL || VOYAGE_DEFAULT_MODEL,
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage embeddings ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    data: { embedding: number[] }[];
  };
  return data.data[0].embedding;
}

async function embedOpenAI(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model: "text-embedding-3-small",
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    data: { embedding: number[] }[];
  };
  return data.data[0].embedding;
}

const DIM = 256;

// Deterministic 32-bit string hash (djb2-xor variant).
function hash(s: string): number {
  let h = 5381 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function embedLocal(text: string): number[] {
  const vec = new Array<number>(DIM).fill(0);
  const words = tokenize(text);

  for (const word of words) {
    vec[hash("w:" + word) % DIM] += 1.0;
    if (word.length >= 5) {
      vec[hash("s:" + word.slice(0, 5)) % DIM] += 0.6;
    }
    const padded = " " + word + " ";
    for (let i = 0; i <= padded.length - 3; i++) {
      vec[hash("t:" + padded.slice(i, i + 3)) % DIM] += 0.25;
    }
  }

  // L2 normalize
  let mag = 0;
  for (let i = 0; i < DIM; i++) mag += vec[i] * vec[i];
  mag = Math.sqrt(mag) || 1;
  for (let i = 0; i < DIM; i++) vec[i] /= mag;
  return vec;
}
