import { createHash } from "node:crypto";
import type { JsonValue } from "./types.js";

function encode(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON does not allow non-finite numbers.");
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new TypeError("Canonical JSON does not allow circular values.");
    }
    ancestors.add(value);
    const items: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        throw new TypeError("Canonical JSON does not allow sparse arrays.");
      }
      items.push(encode(value[index], ancestors));
    }
    const result = `[${items.join(",")}]`;
    ancestors.delete(value);
    return result;
  }

  if (typeof value !== "object" || value === undefined) {
    throw new TypeError("Value is not JSON-compatible.");
  }

  const objectValue = value as Record<string, unknown>;
  const prototype = Object.getPrototypeOf(objectValue) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Canonical JSON requires plain objects.");
  }
  if (ancestors.has(objectValue)) {
    throw new TypeError("Canonical JSON does not allow circular values.");
  }
  if (Object.getOwnPropertySymbols(objectValue).length > 0) {
    throw new TypeError("Canonical JSON does not allow symbol keys.");
  }

  ancestors.add(objectValue);
  const keys = Object.keys(objectValue).sort();
  const entries = keys.map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(objectValue, key);
    if (!descriptor || !("value" in descriptor)) {
      throw new TypeError("Canonical JSON does not allow accessors.");
    }
    return `${JSON.stringify(key)}:${encode(descriptor.value, ancestors)}`;
  });
  ancestors.delete(objectValue);
  return `{${entries.join(",")}}`;
}

export function canonicalJson(value: unknown): string {
  return encode(value, new Set<object>());
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function digestJson(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function parseJsonValue(value: string): JsonValue {
  const parsed: unknown = JSON.parse(value);
  canonicalJson(parsed);
  return parsed as JsonValue;
}
