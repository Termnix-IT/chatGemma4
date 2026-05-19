import type { ToolDefinition, ToolResult } from "../../../shared/types.js";

export const datetimeToolDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "get_current_datetime",
    description:
      "Get the current date and time. Use this when the user asks about today, the current time, the current date, weekdays, or time zones.",
    parameters: {
      type: "object",
      properties: {
        timeZone: {
          type: "string",
          description: "Optional IANA time zone name, for example Asia/Tokyo or America/New_York"
        }
      }
    }
  }
};

export async function executeDatetimeTool(callId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const requestedTimeZone = typeof args.timeZone === "string" ? args.timeZone.trim() : "";
  const timeZone = requestedTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const now = new Date();

  try {
    const formatter = new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "full",
      timeStyle: "long",
      timeZone
    });

    const content = JSON.stringify(
      {
        iso: now.toISOString(),
        timeZone,
        localized: formatter.format(now),
        unixMilliseconds: now.getTime()
      },
      null,
      2
    );

    return {
      callId,
      name: datetimeToolDefinition.function.name,
      ok: true,
      content
    };
  } catch {
    return {
      callId,
      name: datetimeToolDefinition.function.name,
      ok: false,
      content: "",
      error: `Invalid time zone: ${timeZone}`
    };
  }
}
