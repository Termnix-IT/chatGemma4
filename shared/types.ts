export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  id?: string;
  role: ChatRole;
  content: string;
  createdAt?: string;
  toolName?: string;
}

export interface ChatOptions {
  temperature: number;
}

export type ChatMode = "chat" | "agent";

export interface ChatRequest {
  conversationId: string;
  mode: ChatMode;
  model: string;
  messages: ChatMessage[];
  options: ChatOptions;
}

export interface HealthResponse {
  ok: boolean;
  server: "running";
  model: string;
  ollama: {
    reachable: boolean;
    modelAvailable: boolean;
    error?: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  name: string;
  ok: boolean;
  content: string;
  error?: string;
}

export type ChatStreamEvent =
  | { type: "content"; content: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_result"; result: ToolResult }
  | { type: "error"; error: string };
