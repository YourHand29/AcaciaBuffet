/**
 * Layered merge: defaults ← heuristics ← ai ← user.
 * Later layers win. Objects merge recursively; arrays and scalars replace.
 * `_provenance` is rebuilt so each top-level-or-deeper path records the layer
 * that last set it.
 */

export type Layer = "default" | "heuristic" | "ai" | "user";

type Plain = Record<string, unknown>;

function isPlainObject(v: unknown): v is Plain {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function walk(obj: Plain, prefix: string, out: Record<string, Layer>, layer: Layer) {
  for (const [k, v] of Object.entries(obj)) {
    if (k === "_provenance") continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v) && Object.keys(v).length > 0) {
      walk(v, path, out, layer);
    } else {
      out[path] = layer;
    }
  }
}

function deepMerge(base: Plain, patch: Plain): Plain {
  const out: Plain = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const existing = out[k];
    out[k] = isPlainObject(existing) && isPlainObject(v) ? deepMerge(existing, v) : v;
  }
  return out;
}

export function mergeLayers(layers: Array<{ layer: Layer; value: Plain | null | undefined }>): Plain {
  let merged: Plain = {};
  const provenance: Record<string, Layer> = {};
  for (const { layer, value } of layers) {
    if (!value) continue;
    const { _provenance: _ignored, ...rest } = value;
    merged = deepMerge(merged, rest);
    walk(rest, "", provenance, layer);
  }
  merged._provenance = provenance;
  return merged;
}

/** Paths (dotted) that the user layer owns; used to protect them from re-analysis. */
export function userOwnedPaths(provenance: Record<string, Layer>): Set<string> {
  return new Set(Object.entries(provenance).filter(([, l]) => l === "user").map(([p]) => p));
}

/** Remove from `patch` any path the user already owns. */
export function stripUserOwned(patch: Plain, owned: Set<string>, prefix = ""): Plain {
  const out: Plain = {};
  for (const [k, v] of Object.entries(patch)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if ([...owned].some((o) => o === path || o.startsWith(path + "."))) {
      if (isPlainObject(v)) {
        const inner = stripUserOwned(v, owned, path);
        if (Object.keys(inner).length) out[k] = inner;
      }
      continue;
    }
    out[k] = v;
  }
  return out;
}
