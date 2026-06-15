import type { NormalizedOpinion, NormalizedSignal, NormalizedStrength } from "./types";

export function opinion(signal: NormalizedSignal, strength: NormalizedStrength, reason: string): NormalizedOpinion {
  return { signal, strength, reason };
}

export function neutralOpinion(reason: string): NormalizedOpinion {
  return opinion("NEUTRAL", "WEAK", reason);
}
