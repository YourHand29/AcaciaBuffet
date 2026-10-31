import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "./store.ts";
import { normalizeLayout } from "./schema.ts";

function freshStore() {
  const dir = mkdtempSync(join(tmpdir(), "acacia-config-"));
  const store = new ConfigStore(dir);
  store.ensureDefaults();
  return { dir, store };
}

test("empty config resolves to defaults", () => {
  const { store } = freshStore();
  const wf = store.resolveWorkflow(1);
  assert.equal(wf.importance, "normal");
  assert.deepEqual(normalizeLayout(wf.layout).map((s) => s.type), ["upcoming", "announcements", "modules", "grades", "syllabus_card"]);
  assert.equal(wf.notifications.channel, "push");
  const info = store.resolveInfo(1);
  assert.equal(info.structure.organized_by, "unknown");
  assert.equal(info.course_id, 1);
});

test("generated layer fills in, user layer wins, provenance tracked", () => {
  const { dir, store } = freshStore();
  store.writeGenerated(7, { alias: "GEN", grading: { weights_in_canvas: true, weights_from: "canvas" } }, "heuristic");
  mkdirSync(join(dir, "courses", "7"), { recursive: true });
  writeFileSync(join(dir, "courses", "7", "info.yaml"), "alias: Bio 201\ncolor: '#4caf50'\n");

  const info = store.resolveInfo(7);
  assert.equal(info.alias, "Bio 201");
  assert.equal(info.color, "#4caf50");
  assert.equal(info.grading.weights_in_canvas, true);
  assert.equal(info._provenance["alias"], "user");
  assert.equal(info._provenance["grading.weights_in_canvas"], "heuristic");
});

test("re-analysis does not clobber user-owned paths", () => {
  const { store } = freshStore();
  store.patchUser(9, "info", { alias: "Mine", _provenance: { alias: "user" } });
  store.writeGenerated(9, { alias: "Generated", term: "Fall" }, "heuristic");
  const info = store.resolveInfo(9);
  assert.equal(info.alias, "Mine");
  assert.equal(info.term, "Fall");
});

test("layout entries with options normalize", () => {
  const segs = normalizeLayout(["upcoming", { modules: { view: "current-week" } }]);
  assert.deepEqual(segs, [
    { type: "upcoming", options: {} },
    { type: "modules", options: { view: "current-week" } },
  ]);
});

test("invalid yaml is rejected on write", () => {
  const { store } = freshStore();
  assert.throws(() => store.writeRaw(3, "workflow", "importance: extreme\n"));
});
