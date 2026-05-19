import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ChatMode,
  ChatMessage,
  ChatOptions,
  ChatRequest,
  ChatStreamEvent,
  AgentToolsResponse,
  HealthResponse,
  ToolCall,
  ToolDefinition,
  ToolResult
} from "../../shared/types.js";
import { agentToolDefinitions, agentToolSummaries, executeRegisteredTool } from "./tools/registry.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const defaultModel = process.env.OLLAMA_MODEL ?? "gemma4:latest";
const moduleDir = dirname(fileURLToPath(import.meta.url));
const clientDistPath = findClientDistPath();

type OllamaToolCall = {
  type?: string;
  function: {
    index?: number;
    name: string;
    arguments: Record<string, unknown>;
  };
};

type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_name?: string;
  tool_calls?: OllamaToolCall[];
};

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", async (_req, res) => {
  const health = await getHealth();
  res.status(health.ok ? 200 : 503).json(health);
});

app.get("/api/tools", (_req, res) => {
  const response: AgentToolsResponse = {
    tools: agentToolSummaries
  };

  res.json(response);
});

app.post("/api/chat", async (req, res) => {
  const body = req.body as Partial<ChatRequest>;
  const validationError = validateChatRequest(body);

  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const model = body.model?.trim() || defaultModel;
  const options = {
    temperature: body.options?.temperature ?? 0.7
  };

  try {
    res.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    const mode = body.mode ?? "chat";
    const messages = normalizeMessages(body.messages ?? []);

    if (mode === "agent") {
      await runToolLoop(model, messages, options, res);
      return;
    }

    await runChatPass(model, messages, options, res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(502).json({
        error: "Could not connect to Ollama",
        details: getErrorMessage(error)
      });
      return;
    }

    writeStreamEvent(res, { type: "error", error: getErrorMessage(error) });
    res.end();
  }
});

if (existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }

    res.sendFile(join(clientDistPath, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`chatGemma listening on http://127.0.0.1:${port}`);
  console.log(`client assets: ${existsSync(clientDistPath) ? clientDistPath : "not found"}`);
});

function findClientDistPath() {
  const candidates = [
    join(process.cwd(), "dist", "client"),
    join(moduleDir, "..", "..", "client"),
    join(moduleDir, "..", "..", "dist", "client")
  ];

  return candidates.find((candidate) => existsSync(join(candidate, "index.html"))) ?? candidates[0];
}

async function getHealth(): Promise<HealthResponse> {
  try {
    const response = await fetch(`${ollamaBaseUrl}/api/tags`);

    if (!response.ok) {
      return {
        ok: false,
        server: "running",
        model: defaultModel,
        ollama: {
          reachable: false,
          modelAvailable: false,
          error: `Ollama returned ${response.status}`
        }
      };
    }

    const data = (await response.json()) as { models?: Array<{ name?: string }> };
    const modelAvailable = data.models?.some((model) => model.name === defaultModel) ?? false;

    return {
      ok: modelAvailable,
      server: "running",
      model: defaultModel,
      ollama: {
        reachable: true,
        modelAvailable,
        error: modelAvailable ? undefined : `${defaultModel} was not found in Ollama`
      }
    };
  } catch (error) {
    return {
      ok: false,
      server: "running",
      model: defaultModel,
      ollama: {
        reachable: false,
        modelAvailable: false,
        error: getErrorMessage(error)
      }
    };
  }
}

function validateChatRequest(body: Partial<ChatRequest>): string | null {
  if (!body.conversationId || typeof body.conversationId !== "string") {
    return "conversationId is required";
  }

  if (body.mode && !["chat", "agent"].includes(body.mode)) {
    return "mode is invalid";
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return "messages must contain at least one message";
  }

  for (const message of body.messages) {
    if (!message || typeof message.content !== "string" || message.content.trim().length === 0) {
      return "each message must include content";
    }

    if (!["system", "user", "assistant", "tool"].includes(message.role)) {
      return "message role is invalid";
    }
  }

  if (body.options && typeof body.options.temperature !== "number") {
    return "options.temperature must be a number";
  }

  return null;
}

function normalizeMessages(messages: ChatMessage[]): OllamaMessage[] {
  return messages
    .filter((message) => message.role !== "tool")
    .map((message) => ({
      role: message.role,
      content: message.content
    }));
}

async function runChatPass(
  model: string,
  messages: OllamaMessage[],
  options: ChatOptions,
  res: express.Response
) {
  await streamOllamaPass(model, messages, options, res, "chat");
  res.end();
}

async function runToolLoop(
  model: string,
  initialMessages: OllamaMessage[],
  options: ChatOptions,
  res: express.Response
) {
  const messages = [...initialMessages];
  const maxToolRounds = 2;

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const result = await streamOllamaPass(model, messages, options, res, "agent");

    if (result.content || result.toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: result.content,
        tool_calls: result.toolCalls.map((call, index) => ({
          type: "function",
          function: {
            index,
            name: call.name,
            arguments: call.arguments
          }
        }))
      });
    }

    if (result.toolCalls.length === 0) {
      res.end();
      return;
    }

    for (const call of result.toolCalls) {
      writeStreamEvent(res, { type: "tool_call", call });

      const toolResult = await executeToolCall(call);
      writeStreamEvent(res, { type: "tool_result", result: toolResult });

      messages.push({
        role: "tool",
        tool_name: call.name,
        content: toolResult.ok ? toolResult.content : `Tool failed: ${toolResult.error ?? "Unknown error"}`
      });
    }
  }

  writeStreamEvent(res, {
    type: "error",
    error: "Tool loop stopped because the maximum number of tool rounds was reached"
  });
  res.end();
}

async function streamOllamaPass(
  model: string,
  messages: OllamaMessage[],
  options: ChatOptions,
  res: express.Response,
  mode: ChatMode
) {
  const requestBody: {
    model: string;
    messages: OllamaMessage[];
    stream: boolean;
    tools?: ToolDefinition[];
    options: ChatOptions;
  } = {
    model,
    messages,
    stream: true,
    options
  };

  if (mode === "agent") {
    requestBody.tools = agentToolDefinitions;
  }

  const ollamaResponse = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  if (!ollamaResponse.ok || !ollamaResponse.body) {
    const details = await safeReadText(ollamaResponse);
    throw new Error(`Ollama chat request failed: ${details || ollamaResponse.status}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCalls = new Map<string, ToolCall>();

  for await (const chunk of ollamaResponse.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const result = readOllamaLine(line);

      if (result.content) {
        content += result.content;
        writeStreamEvent(res, { type: "content", content: result.content });
      }

      for (const call of result.toolCalls) {
        toolCalls.set(`${call.name}:${JSON.stringify(call.arguments)}`, call);
      }
    }
  }

  if (buffer.trim()) {
    const result = readOllamaLine(buffer);

    if (result.content) {
      content += result.content;
      writeStreamEvent(res, { type: "content", content: result.content });
    }

    for (const call of result.toolCalls) {
      toolCalls.set(`${call.name}:${JSON.stringify(call.arguments)}`, call);
    }
  }

  return { content, toolCalls: [...toolCalls.values()] };
}

function readOllamaLine(line: string) {
  const trimmed = line.trim();
  const result: { content: string; toolCalls: ToolCall[] } = { content: "", toolCalls: [] };

  if (!trimmed) {
    return result;
  }

  const parsed = safeParseOllamaLine(trimmed);

  if (!parsed) {
    return { content: trimmed, toolCalls: [] };
  }

  if (parsed.error) {
    throw new Error(parsed.error);
  }

  if (parsed.message?.content) {
    result.content = parsed.message.content;
  }

  if (parsed.message?.tool_calls?.length) {
    result.toolCalls = parsed.message.tool_calls
      .filter((call) => Boolean(call.function?.name))
      .map((call) => ({
        id: crypto.randomUUID(),
        name: call.function?.name ?? "unknown_tool",
        arguments: call.function?.arguments ?? {}
      }));
  }

  return result;
}

function safeParseOllamaLine(line: string) {
  try {
    return JSON.parse(line) as {
      message?: {
        content?: string;
        tool_calls?: Array<{
          type?: string;
          function?: {
            name?: string;
            arguments?: Record<string, unknown>;
          };
        }>;
      };
      error?: string;
      done?: boolean;
    };
  } catch {
    return null;
  }
}

async function executeToolCall(call: ToolCall): Promise<ToolResult> {
  return executeRegisteredTool(call);
}

function writeStreamEvent(res: express.Response, event: ChatStreamEvent) {
  res.write(`${JSON.stringify(event)}\n`);
}

async function safeReadText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
