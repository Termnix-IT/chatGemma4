import type { ToolCall, ToolDefinition, ToolResult } from "../../../shared/types.js";
import { datetimeToolDefinition, executeDatetimeTool } from "./datetime.js";
import { executeWeatherTool, weatherToolDefinition } from "./weather.js";

type ToolEntry = {
  definition: ToolDefinition;
  execute: (callId: string, args: Record<string, unknown>) => Promise<ToolResult>;
};

const toolEntries: ToolEntry[] = [
  {
    definition: datetimeToolDefinition,
    execute: executeDatetimeTool
  },
  {
    definition: weatherToolDefinition,
    execute: executeWeatherTool
  }
];

export const agentToolDefinitions = toolEntries.map((entry) => entry.definition);

export async function executeRegisteredTool(call: ToolCall): Promise<ToolResult> {
  const entry = toolEntries.find((tool) => tool.definition.function.name === call.name);

  if (!entry) {
    return {
      callId: call.id,
      name: call.name,
      ok: false,
      content: "",
      error: `Unknown tool: ${call.name}`
    };
  }

  return entry.execute(call.id, call.arguments);
}
