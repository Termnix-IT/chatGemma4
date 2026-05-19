import type { AgentToolSummary, ToolCall, ToolDefinition, ToolResult } from "../../../shared/types.js";
import { datetimeToolDefinition, executeDatetimeTool } from "./datetime.js";
import { executeUnitConversionTool, unitConversionToolDefinition } from "./units.js";
import {
  executeWeatherForecastTool,
  executeWeatherTool,
  weatherForecastToolDefinition,
  weatherToolDefinition
} from "./weather.js";

type ToolEntry = {
  definition: ToolDefinition;
  displayName: string;
  description: string;
  execute: (callId: string, args: Record<string, unknown>) => Promise<ToolResult>;
};

const toolEntries: ToolEntry[] = [
  {
    definition: datetimeToolDefinition,
    displayName: "現在日時",
    description: "現在の日付、時刻、曜日、timezoneを取得します。",
    execute: executeDatetimeTool
  },
  {
    definition: unitConversionToolDefinition,
    displayName: "単位変換",
    description: "温度、距離、重さ、容量を安全に変換します。",
    execute: executeUnitConversionTool
  },
  {
    definition: weatherToolDefinition,
    displayName: "現在天気",
    description: "都市や場所の現在天気、気温、風速を取得します。",
    execute: executeWeatherTool
  },
  {
    definition: weatherForecastToolDefinition,
    displayName: "天気予報",
    description: "指定した場所の日別予報、最高/最低気温、降水確率を取得します。",
    execute: executeWeatherForecastTool
  }
];

export const agentToolDefinitions = toolEntries.map((entry) => entry.definition);

export const agentToolSummaries: AgentToolSummary[] = toolEntries.map((entry) => ({
  name: entry.definition.function.name,
  displayName: entry.displayName,
  description: entry.description
}));

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
