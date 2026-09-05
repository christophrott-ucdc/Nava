import test from "node:test";
import assert from "node:assert/strict";
import { createOpticalMarkerMap, opticalMarkerSvg, validateOpticalMarkerMap, validateOpticalCalibration, opticalWallGeometry } from "./optical-calibration";

function fixture() {
  const mapping = createOpticalMarkerMap([
    { displayId: "left", hardwareKey: "device-a", pixelWidth: 1920, pixelHeight: 1080 },
    { displayId: "right", hardwareKey: "device-b", pixelWidth: 1920, pixelHeight: 1080 },
  ], "topology-revision-1", "Scaunul de referință");
  const result = {
    schemaVersion: 1, kind: "nava-optical-calibration", status: "accepted", topologyHash: mapping.topologyHash,
    mapping, metric: false, source: "camera-image", imageSize: { width: 2000, height: 1000 }, coordinateSpace: "camera-pixels",
    referencePosition: mapping.referencePosition, order: ["left", "right"], reasons: [],
    displays: mapping.displays.map((d, i) => {
      const x = 0.05 + i * 0.5;
      const normalizedCorners = [[x, 0.2], [x + 0.4, 0.2], [x + 0.4, 0.8], [x, 0.8]];
      return { displayId: d.displayId, hardwareKey: d.hardwareKey, markerIds: d.markerIds, normalizedCorners,
        activeCorners: normalizedCorners.map(([u, v]) => [u * 2000, v * 1000]), uvToCamera: [0.4, 0, x, 0, 0.6, 0.2, 0, 0, 1], confidence: 0.85, rmsPx: 0.3, independentRmsPx: 0.6, coverage: 1 };
    }),
    gaps: [{ leftDisplayId: "left", rightDisplayId: "right", projectedGap: 0.1, units: "normalized-camera-width" }],
  };
  return { mapping, result };
}
test("four unique, camera-readable markers per display; all requested wall sizes", () => {
  for (const count of [1, 3, 4, 5, 6, 7, 8, 9, 10, 16]) {
    const mapping = createOpticalMarkerMap(Array.from({ length: count }, (_, i) => ({ displayId: `tv-${i}`, hardwareKey: `hw-${i}`, pixelWidth: 3840, pixelHeight: 2160 })), "revision");
    assert.equal(new Set(mapping.displays.flatMap(d => d.markerIds)).size, count * 4);
    assert.equal(validateOpticalMarkerMap(mapping).ok, true);
    assert.match(opticalMarkerSvg(mapping, `tv-${count - 1}`), /viewBox="0 0 3840 2160"/);
  }
});
test("mapping rejects missing identity, duplicated markers and impossible dimensions", () => {
  const { mapping } = fixture();
  const bad = structuredClone(mapping); bad.displays[1].markerIds[0] = 0;
  assert.equal(validateOpticalMarkerMap(bad).ok, false);
  bad.displays[1].markerIds[0] = 4; bad.displays[1].hardwareKey = bad.displays[0].hardwareKey;
  assert.equal(validateOpticalMarkerMap(bad).ok, false);
  assert.throws(() => createOpticalMarkerMap([], "revision"));
  assert.throws(() => createOpticalMarkerMap([{ displayId: "a", hardwareKey: "b", pixelWidth: 1, pixelHeight: 2 }], "revision"));
});
test("SVG escapes labels and uses four real six-cell marker borders", () => {
  const map = createOpticalMarkerMap([{ displayId: '<script>"x"</script>', hardwareKey: "h", pixelWidth: 1920, pixelHeight: 1080 }], "r");
  const svg = opticalMarkerSvg(map, map.displays[0].displayId);
  assert(!svg.includes("<script>")); assert(svg.includes("&lt;script&gt;"));
  assert.equal((svg.match(/width="6" height="6" fill="black"/g) || []).length, 4);
});
test("complete non-metric observed calibration is importable", () => {
  const { mapping, result } = fixture();
  assert.deepEqual(validateOpticalCalibration(result, mapping), { ok: true, calibration: result });
});
test("compositor coordinates remove room margins while preserving the observed wall gap", () => {
  const { mapping, result } = fixture();
  const checked = validateOpticalCalibration(result, mapping);
  assert(checked.ok);
  const geometry = opticalWallGeometry(checked.calibration);
  assert(Math.abs(geometry.bounds.width - 0.9) < 1e-9);
  assert(Math.abs(geometry.panels[0].uvToWall[2]) < 1e-9);
  assert(Math.abs(geometry.panels[1].uvToWall[2] - 0.5/0.9) < 1e-9);
  assert(Math.abs(geometry.panels[1].corners[2][0] - 1) < 1e-9);
});
test("video imports require three consistent frames and intrinsic claims require provenance", () => {
  const { mapping, result } = fixture();
  assert.equal(validateOpticalCalibration({ ...result, source: "camera-video" }, mapping).ok, false);
  assert.equal(validateOpticalCalibration({ ...result, source: "camera-video", acceptedFrames: 3, sampledFrames: 4, temporalMaxDeviationPx: 0.8 }, mapping).ok, true);
  assert.equal(validateOpticalCalibration({ ...result, source: "camera-video", acceptedFrames: 3, sampledFrames: 4, temporalMaxDeviationPx: 2.1 }, mapping).ok, false);
  assert.equal(validateOpticalCalibration({ ...result, coordinateSpace: "undistorted-camera-pixels" }, mapping).ok, false);
});
test("partial, rejected, stale hardware and metric claims are rejected", () => {
  for (const mutate of [
    (r: ReturnType<typeof fixture>["result"]) => { r.displays.pop(); },
    (r: ReturnType<typeof fixture>["result"]) => { r.status = "rejected"; },
    (r: ReturnType<typeof fixture>["result"]) => { r.displays[0].hardwareKey = "replacement"; },
    (r: ReturnType<typeof fixture>["result"]) => { r.metric = true; },
    (r: ReturnType<typeof fixture>["result"]) => { r.topologyHash = "different"; },
    (r: ReturnType<typeof fixture>["result"]) => { r.displays[0].coverage = 0.75; },
    (r: ReturnType<typeof fixture>["result"]) => { r.displays[0].independentRmsPx = 2.01; },
  ]) { const { mapping, result } = fixture(); mutate(result); assert.equal(validateOpticalCalibration(result, mapping).ok, false); }
});
test("wrong mapping offsets and malformed/projectively inconsistent geometry fail", () => {
  for (const mutate of [
    (r: ReturnType<typeof fixture>["result"]) => { r.mapping.displays[0].marginPx += 1; },
    (r: ReturnType<typeof fixture>["result"]) => { r.displays[0].uvToCamera[2] += 0.1; },
    (r: ReturnType<typeof fixture>["result"]) => { r.displays[0].activeCorners[0][0] = -30; },
    (r: ReturnType<typeof fixture>["result"]) => { r.displays[0].normalizedCorners.reverse(); },
    (r: ReturnType<typeof fixture>["result"]) => { r.displays[0].uvToCamera[0] = NaN; },
    (r: ReturnType<typeof fixture>["result"]) => { r.order.reverse(); },
    (r: ReturnType<typeof fixture>["result"]) => { r.gaps[0].projectedGap = 0.3; },
  ]) { const { mapping, result } = fixture(); const independentMapping = structuredClone(mapping); mutate(result); assert.equal(validateOpticalCalibration(result, independentMapping).ok, false); }
});
