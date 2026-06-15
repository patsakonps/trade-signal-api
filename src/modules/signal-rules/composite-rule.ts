export const COMPOSITE_ALL_KEY = "COMPOSITE_ALL";

export type CompositeRuleComponent = {
  indicatorKey: string;
  paramsJson?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readCompositeRuleComponents(params: Record<string, unknown>): CompositeRuleComponent[] {
  const rawComponents = params.components;
  if (!Array.isArray(rawComponents)) return [];

  return rawComponents.flatMap((item): CompositeRuleComponent[] => {
    if (!isRecord(item)) return [];
    const indicatorKey = typeof item.indicatorKey === "string" ? item.indicatorKey.trim().toUpperCase() : "";
    if (!indicatorKey) return [];

    const paramsJson = isRecord(item.paramsJson) ? item.paramsJson : undefined;
    return [{ indicatorKey, paramsJson }];
  });
}

export function isCompositeAllRule(indicatorKey: string): boolean {
  return indicatorKey.trim().toUpperCase() === COMPOSITE_ALL_KEY;
}
