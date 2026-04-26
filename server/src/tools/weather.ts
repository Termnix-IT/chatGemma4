import type { ToolDefinition, ToolResult } from "../../../shared/types.js";

type GeocodingResponse = {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    admin1?: string;
    timezone?: string;
  }>;
};

type ForecastResponse = {
  current_weather?: {
    temperature: number;
    windspeed: number;
    winddirection: number;
    weathercode: number;
    time: string;
  };
  timezone?: string;
};

export const weatherToolDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "get_current_weather",
    description:
      "Get the current weather for a city or place. Use this when the user asks about today's weather, current temperature, rain, wind, or weather conditions.",
    parameters: {
      type: "object",
      required: ["location"],
      properties: {
        location: {
          type: "string",
          description: "City or place name, for example Tokyo, Osaka, New York, or London"
        }
      }
    }
  }
};

export async function executeWeatherTool(callId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const location = typeof args.location === "string" ? args.location.trim() : "";

  if (!location) {
    return {
      callId,
      name: weatherToolDefinition.function.name,
      ok: false,
      content: "",
      error: "location is required"
    };
  }

  try {
    const place = await geocodeLocation(location);
    const weather = await fetchCurrentWeather(place.latitude, place.longitude);
    const current = weather.current_weather;

    if (!current) {
      throw new Error("Current weather was not included in the forecast response");
    }

    const label = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
    const condition = describeWeatherCode(current.weathercode);
    const content = JSON.stringify(
      {
        location: label,
        requestedLocation: location,
        timezone: weather.timezone ?? place.timezone,
        observedAt: current.time,
        temperatureCelsius: current.temperature,
        windSpeedKmh: current.windspeed,
        windDirectionDegrees: current.winddirection,
        weatherCode: current.weathercode,
        condition
      },
      null,
      2
    );

    return {
      callId,
      name: weatherToolDefinition.function.name,
      ok: true,
      content
    };
  } catch (error) {
    return {
      callId,
      name: weatherToolDefinition.function.name,
      ok: false,
      content: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function geocodeLocation(location: string) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", location);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "ja");
  url.searchParams.set("format", "json");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Geocoding failed with ${response.status}`);
  }

  const data = (await response.json()) as GeocodingResponse;
  const place = data.results?.[0];

  if (!place) {
    throw new Error(`Location not found: ${location}`);
  }

  return place;
}

async function fetchCurrentWeather(latitude: number, longitude: number) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("current_weather", "true");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Weather forecast failed with ${response.status}`);
  }

  return (await response.json()) as ForecastResponse;
}

function describeWeatherCode(code: number) {
  const descriptions: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm"
  };

  return descriptions[code] ?? "Unknown";
}
