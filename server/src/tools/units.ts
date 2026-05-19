import type { ToolDefinition, ToolResult } from "../../../shared/types.js";

type UnitCategory = "temperature" | "distance" | "weight" | "volume";

type LinearUnit = {
  category: Exclude<UnitCategory, "temperature">;
  aliases: string[];
  toBase: number;
};

type UnitDefinition =
  | LinearUnit
  | {
      category: "temperature";
      aliases: string[];
    };

const units: Record<string, UnitDefinition> = {
  celsius: { category: "temperature", aliases: ["c", "celsius", "degree celsius", "degrees celsius", "摂氏"] },
  fahrenheit: { category: "temperature", aliases: ["f", "fahrenheit", "degree fahrenheit", "degrees fahrenheit", "華氏"] },
  kelvin: { category: "temperature", aliases: ["k", "kelvin"] },
  meter: { category: "distance", aliases: ["m", "meter", "meters", "metre", "metres", "メートル"], toBase: 1 },
  kilometer: { category: "distance", aliases: ["km", "kilometer", "kilometers", "kilometre", "kilometres", "キロメートル"], toBase: 1000 },
  centimeter: { category: "distance", aliases: ["cm", "centimeter", "centimeters", "centimetre", "centimetres", "センチメートル"], toBase: 0.01 },
  millimeter: { category: "distance", aliases: ["mm", "millimeter", "millimeters", "millimetre", "millimetres", "ミリメートル"], toBase: 0.001 },
  mile: { category: "distance", aliases: ["mi", "mile", "miles", "マイル"], toBase: 1609.344 },
  yard: { category: "distance", aliases: ["yd", "yard", "yards", "ヤード"], toBase: 0.9144 },
  foot: { category: "distance", aliases: ["ft", "foot", "feet", "フィート"], toBase: 0.3048 },
  inch: { category: "distance", aliases: ["in", "inch", "inches", "インチ"], toBase: 0.0254 },
  gram: { category: "weight", aliases: ["g", "gram", "grams", "グラム"], toBase: 1 },
  kilogram: { category: "weight", aliases: ["kg", "kilogram", "kilograms", "キログラム"], toBase: 1000 },
  milligram: { category: "weight", aliases: ["mg", "milligram", "milligrams", "ミリグラム"], toBase: 0.001 },
  pound: { category: "weight", aliases: ["lb", "lbs", "pound", "pounds", "ポンド"], toBase: 453.59237 },
  ounce: { category: "weight", aliases: ["oz", "ounce", "ounces", "オンス"], toBase: 28.349523125 },
  liter: { category: "volume", aliases: ["l", "liter", "liters", "litre", "litres", "リットル"], toBase: 1 },
  milliliter: { category: "volume", aliases: ["ml", "milliliter", "milliliters", "millilitre", "millilitres", "ミリリットル"], toBase: 0.001 },
  cubic_meter: { category: "volume", aliases: ["m3", "cubic meter", "cubic meters", "立方メートル"], toBase: 1000 },
  gallon_us: { category: "volume", aliases: ["gal", "gallon", "gallons", "us gallon", "us gallons", "ガロン"], toBase: 3.785411784 },
  quart_us: { category: "volume", aliases: ["qt", "quart", "quarts"], toBase: 0.946352946 },
  pint_us: { category: "volume", aliases: ["pt", "pint", "pints"], toBase: 0.473176473 }
};

const unitAliases = new Map<string, string>();

for (const [canonical, unit] of Object.entries(units)) {
  unitAliases.set(normalizeUnitName(canonical), canonical);

  for (const alias of unit.aliases) {
    unitAliases.set(normalizeUnitName(alias), canonical);
  }
}

export const unitConversionToolDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "convert_units",
    description:
      "Convert a numeric value between common units. Supports temperature, distance, weight, and volume. Does not support currency conversion.",
    parameters: {
      type: "object",
      required: ["value", "fromUnit", "toUnit"],
      properties: {
        value: {
          type: "number",
          description: "Numeric value to convert"
        },
        fromUnit: {
          type: "string",
          description: "Source unit, for example celsius, km, mile, kg, pound, liter, or gallon"
        },
        toUnit: {
          type: "string",
          description: "Target unit, for example fahrenheit, meter, inch, gram, or milliliter"
        }
      }
    }
  }
};

export async function executeUnitConversionTool(callId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const value = typeof args.value === "number" ? args.value : Number(args.value);
  const fromUnit = typeof args.fromUnit === "string" ? resolveUnit(args.fromUnit) : null;
  const toUnit = typeof args.toUnit === "string" ? resolveUnit(args.toUnit) : null;

  if (!Number.isFinite(value)) {
    return failed(callId, "value must be a finite number");
  }

  if (!fromUnit) {
    return failed(callId, "fromUnit is unsupported or missing");
  }

  if (!toUnit) {
    return failed(callId, "toUnit is unsupported or missing");
  }

  const source = units[fromUnit];
  const target = units[toUnit];

  if (source.category !== target.category) {
    return failed(callId, `Cannot convert ${source.category} to ${target.category}`);
  }

  let convertedValue: number;

  if (source.category === "temperature") {
    convertedValue = convertTemperature(value, fromUnit, toUnit);
  } else {
    convertedValue = convertLinearUnit(value, source, target as LinearUnit);
  }

  const content = JSON.stringify(
    {
      value,
      fromUnit,
      toUnit,
      category: source.category,
      convertedValue,
      roundedValue: roundForDisplay(convertedValue)
    },
    null,
    2
  );

  return {
    callId,
    name: unitConversionToolDefinition.function.name,
    ok: true,
    content
  };
}

function failed(callId: string, error: string): ToolResult {
  return {
    callId,
    name: unitConversionToolDefinition.function.name,
    ok: false,
    content: "",
    error
  };
}

function resolveUnit(value: string) {
  return unitAliases.get(normalizeUnitName(value)) ?? null;
}

function normalizeUnitName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function convertLinearUnit(value: number, source: LinearUnit, target: LinearUnit) {
  return (value * source.toBase) / target.toBase;
}

function convertTemperature(value: number, fromUnit: string, toUnit: string) {
  const celsius = toCelsius(value, fromUnit);

  if (toUnit === "celsius") {
    return celsius;
  }

  if (toUnit === "fahrenheit") {
    return celsius * 1.8 + 32;
  }

  return celsius + 273.15;
}

function toCelsius(value: number, fromUnit: string) {
  if (fromUnit === "celsius") {
    return value;
  }

  if (fromUnit === "fahrenheit") {
    return (value - 32) / 1.8;
  }

  return value - 273.15;
}

function roundForDisplay(value: number) {
  return Number.parseFloat(value.toFixed(6));
}
