import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PerfSample } from "../shared/types";
import { computeFps, formatPerfLine } from "./perf";
import { fitWithin } from "./photo";
import { rmsToLevel, roomMicRequested } from "./room-mic";
import { canvasBacking, pickFocusViewport, viewportCss } from "./span";

describe("perf.computeFps", () => {
  it("rounds frames per interval to fps", () => {
    assert.equal(computeFps(60, 1000), 60);
    assert.equal(computeFps(30, 500), 60);
    assert.equal(computeFps(0, 1000), 0);
  });
  it("returns null when nothing can be measured", () => {
    assert.equal(computeFps(10, 0), null);
    assert.equal(computeFps(-1, 1000), null);
    assert.equal(computeFps(NaN, 1000), null);
  });
});

describe("perf.formatPerfLine", () => {
  const base: PerfSample = {
    screenId: "center",
    atMs: 0,
    videoDropped: 3,
    videoTotal: 8123,
    videoFps: 60,
    avatarFps: 58,
    lipsyncLatencyMs: 41.6,
    driftSec: null,
    roomLevel: null,
    heapMb: 312,
    audioOutput: "HDMI 2",
  };
  it("lists every available field, in order", () => {
    assert.equal(formatPerfLine(base), "video 60 fps · 3/8123 pierdute · avatar 58 fps · lipsync 42 ms · heap 312 MB · HDMI 2");
  });
  it("omits null fields", () => {
    const s: PerfSample = { ...base, videoFps: null, videoTotal: 0, avatarFps: null, lipsyncLatencyMs: null, heapMb: null, audioOutput: null, roomLevel: 0.42 };
    assert.equal(formatPerfLine(s), "video — fps · sală 42%");
  });
});

describe("photo.fitWithin", () => {
  it("scales the larger side down to max, keeps aspect, never upscales", () => {
    assert.deepEqual(fitWithin(1920, 1080, 1280), { width: 1280, height: 720 });
    assert.deepEqual(fitWithin(640, 480, 1280), { width: 640, height: 480 });
    assert.deepEqual(fitWithin(1080, 1920, 1280), { width: 720, height: 1280 });
    assert.deepEqual(fitWithin(0, 100, 1280), { width: 0, height: 0 });
  });
});

describe("room-mic", () => {
  it("is off unless ?mic=1", () => {
    assert.equal(roomMicRequested(""), false);
    assert.equal(roomMicRequested("?screen=center"), false);
    assert.equal(roomMicRequested("?screen=center&mic=1"), true);
    assert.equal(roomMicRequested("?mic=true"), true);
    assert.equal(roomMicRequested("?mic=0"), false);
  });
  it("maps RMS to a 0..1 level, monotonic and clamped", () => {
    assert.equal(rmsToLevel(0), 0);
    assert.equal(rmsToLevel(-1), 0);
    assert.equal(rmsToLevel(NaN), 0);
    assert.ok(rmsToLevel(0.05) < rmsToLevel(0.15));
    assert.equal(rmsToLevel(0.25), 1);
    assert.equal(rmsToLevel(5), 1);
  });
});

describe("span", () => {
  const viewports = [
    { screenId: "port-outer", x: 0, y: 0, width: 1920, height: 1080, scaleFactor: 1 },
    { screenId: "center", x: 1920, y: 0, width: 3840, height: 2160, scaleFactor: 1 },
    { screenId: "starboard", x: 5760, y: 0, width: 1920, height: 1080, scaleFactor: 1 },
  ];
  const screen = (id: string, showAvatar: boolean, showSubtitles: boolean) => ({
    id,
    displayIndex: 0,
    showAvatar,
    showSubtitles,
    showEntities: false,
    playAudio: id === "center",
    kiosk: true,
  });
  it("focuses the viewport whose screen shows the avatar, else subtitles, else the centre", () => {
    assert.equal(pickFocusViewport(viewports, [screen("port-outer", false, false), screen("center", true, true), screen("starboard", false, false)], "center")?.screenId, "center");
    assert.equal(pickFocusViewport(viewports, [screen("port-outer", false, true), screen("center", false, false), screen("starboard", false, false)], "center")?.screenId, "port-outer");
    assert.equal(pickFocusViewport(viewports, [screen("port-outer", false, false), screen("center", false, false)], "center")?.screenId, "center");
    assert.equal(pickFocusViewport(viewports, [], "nope")?.screenId, "port-outer");
    assert.equal(pickFocusViewport([], [], "center"), null);
  });
  it("places a viewport in CSS px and caps the canvas backing store", () => {
    assert.deepEqual(viewportCss(viewports[1]), { left: "1920px", top: "0px", width: "3840px", height: "2160px" });
    assert.deepEqual(canvasBacking(viewports[0], 1), { width: 1920, height: 1080 });
    assert.deepEqual(canvasBacking(viewports[0], 2), { width: 3840, height: 2160 });
    // native 4K at DPR 1; a 4K viewport at DPR 2 stays capped at 4096 on the longest side
    assert.deepEqual(canvasBacking(viewports[1], 1), { width: 3840, height: 2160 });
    assert.deepEqual(canvasBacking(viewports[1], 2), { width: 4096, height: 2304 });
  });
});
