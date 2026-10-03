/**
 * Inputs that v0.9 renamed or retired, for records saved before it: library
 * cases, study and case files, and shared links.
 *
 * v0.9 put every plant's mining on one soil basis. The ilmenite plant's own
 * mining inputs meant exactly the shared ones, so an ilmenite case keeps its
 * values under the shared keys; on any other case they never acted and are
 * dropped. `kExcFleet` sized the fleet per kg of product and has no
 * soil-basis equivalent, so it is dropped and the case takes the soil-basis
 * fleet. A saved `eMining` keeps its value: its meaning (energy per kg of
 * soil) did not change, only its default.
 *
 * v0.10 derived ilmenite conversion from temperature and residence time, so
 * `fIlmConversion` is an outcome, not an input; and it split the reactor
 * into a hydrogen loop scaled with oxygen and a bed scaled with its hold-up,
 * so `kIlmReactorMass` (the whole block at one feed) has no equivalent. Both
 * are dropped and the case takes the new defaults, which reproduce v0.8's
 * 90% and 18.6 kg per kg/day at Eagle's design point.
 */
const RENAMED: Readonly<Record<string, string>> = {
  eIlmMining: "eMining",
  kIlmMiningMass: "kMiningMass"
};
const RETIRED: readonly string[] = ["kExcFleet", "fIlmConversion", "kIlmReactorMass"];

export function upgradeLegacyParams<T extends object>(raw: T): T {
  const renamed = Object.keys(RENAMED).filter((key) => key in raw);
  const retired = RETIRED.filter((key) => key in raw);
  if (renamed.length === 0 && retired.length === 0) return raw;
  const next = { ...raw } as Record<string, unknown>;
  const ilmenite = next.equatorialProcess === "ilmenite" && next.site !== "polar";
  for (const key of renamed) {
    if (ilmenite) next[RENAMED[key]!] = next[key];
    delete next[key];
  }
  for (const key of retired) delete next[key];
  return next as T;
}
