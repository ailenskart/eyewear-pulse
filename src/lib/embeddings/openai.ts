/**
 * OpenAI text-embedding-3-small helper.
 *
 * Usage:
 *   const vectors = await embedTexts(['rayban wayfarer', 'oakley radar']);
 *   // vectors is Array<number[1536]>
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required for embeddings');
  if (texts.length === 0) return [];
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: texts,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI embed ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json() as { data: Array<{ embedding: number[] }> };
  return data.data.map(d => d.embedding);
}

/**
 * Batch with automatic chunking at 100 texts per request to stay
 * under the OpenAI payload limit.
 */
export async function embedTextsBatched(texts: string[], chunkSize = 100): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize);
    const vectors = await embedTexts(chunk);
    out.push(...vectors);
  }
  return out;
}
