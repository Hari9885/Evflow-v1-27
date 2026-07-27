// POST /api/assistant — Claude-backed driving assistant. Runs the tool-use
// loop server-side; the client only ever sees plain text replies.

import Anthropic from "@anthropic-ai/sdk";
import {
  ASSISTANT_TOOLS,
  executeTool,
  snapshotContext,
  type AssistantSnapshot,
} from "@/lib/assistant-tools";

export const runtime = "nodejs";

const MODEL = "claude-opus-5";
const MAX_ITERATIONS = 4;

const SYSTEM = `You are the EVFLOW driving assistant inside an EV trip planner (Bengaluru–Mysuru demo corridor).
Answer in 1-3 short sentences, plain text. Use the tools for any battery, route or charger question — never invent chargers or numbers.
"Near this charger" or "near the next stop" means call find_chargers with that item's coordinates from the trip context.`;

type ChatTurn = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ configured: false });
  }

  let body: { message?: string; history?: ChatTurn[]; snapshot?: AssistantSnapshot };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "request body is not valid JSON" }, { status: 400 });
  }
  const { message, history = [], snapshot } = body;
  if (typeof message !== "string" || !message.trim() || !snapshot) {
    return Response.json({ error: "message and snapshot are required" }, { status: 400 });
  }

  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history
      .filter(
        (t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string"
      )
      .map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: message },
  ];

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4096,
        output_config: { effort: "low" },
        // Server-side fallback: if a safety classifier declines, Anthropic
        // reruns the request on the recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: `${SYSTEM}\n\nCurrent trip context:\n${snapshotContext(snapshot)}`,
        tools: ASSISTANT_TOOLS,
        messages,
      });

      if (response.stop_reason === "refusal") {
        return Response.json({
          configured: true,
          reply: "I can't help with that — try asking about your battery, route or chargers.",
        });
      }

      const toolUses = response.content.filter((b) => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        const text = response.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();
        return Response.json({
          configured: true,
          reply: text || "Sorry, I couldn't come up with an answer — try rephrasing.",
        });
      }

      // Echo the assistant turn unchanged (thinking blocks included), then
      // answer every tool call in one user message.
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        try {
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: await executeTool(tu.name, tu.input as Record<string, unknown>, snapshot),
          });
        } catch (e) {
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: e instanceof Error ? e.message : "tool failed",
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: results });
    }
    return Response.json({
      configured: true,
      reply: "That took too many steps — try a simpler question.",
    });
  } catch (e) {
    const msg =
      e instanceof Anthropic.APIError
        ? `Assistant error (${e.status}): ${e.message}`
        : e instanceof Error
          ? e.message
          : "assistant failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
