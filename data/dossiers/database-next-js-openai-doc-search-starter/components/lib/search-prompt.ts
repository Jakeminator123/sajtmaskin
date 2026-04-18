export function buildDocSearchPrompt(args: {
  query: string
  contextText: string
}) {
  const { query, contextText } = args

  return `You answer questions using only the provided documentation context.

Rules:
- If the answer is not explicitly supported by the context, say: "Sorry, I don't know based on the provided documentation."
- Do not invent APIs, steps, limits, or configuration.
- Prefer concise markdown.
- Include short code examples only when the context supports them.
- When useful, mention uncertainty clearly.

Context:
${contextText}

Question:
${query}

Answer in markdown:`
}
