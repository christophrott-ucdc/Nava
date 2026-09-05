import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayedVideo, yawSourceRect, yawTransform } from "./perspective";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

describe("displayedVideo", () => {
  it("cover scales to the larger ratio, contain to the smaller", () => {
    // 3840x2052 film on a 1920x1080 screen
    const cover = displayedVideo(1920, 1080, 3840, 2052, "cover");
    close(cover.scale, 1080 / 2052);
    close(cover.displayedWidth, 3840 * (1080 / 2052));
    const contain = displayedVideo(1920, 1080, 3840, 2052, "contain");
    close(contain.scale, 0.5);
    close(contain.displayedHeight, 1026);
  });
});

describe("yawTransform (CSS path)", () => {
  it("is identity for the centre screen", () => {
    const t = yawTransform(0, 1920, 1080, 3840, 2052, "cover");
    assert.equal(t.css, "");
    assert.equal(t.scale, 1);
  });
  it("shifts content left for a starboard (positive yaw) screen and zooms to hide the gap", () => {
    const t = yawTransform(15, 1920, 1080, 3840, 2052, "cover");
    const wd = 3840 * (1080 / 2052);
    close(t.shiftPx, (15 / 50) * wd);
    close(t.translateX, -t.shiftPx);
    close(t.scale, 1 + (2 * t.shiftPx) / 1920);
    assert.equal(t.clamped, false);
    // Both edges covered: |t| <= (scale-1) * W/2
    assert.ok(Math.abs(t.translateX) <= ((t.scale - 1) * 1920) / 2 + 1e-9);
  });
  it("mirrors for port (negative yaw)", () => {
    const r = yawTransform(15, 1920, 1080, 3840, 2052, "cover");
    const l = yawTransform(-15, 1920, 1080, 3840, 2052, "cover");
    close(l.translateX, -r.translateX);
    close(l.scale, r.scale);
  });
  it("clamps the shift to 40 % of the displayed width", () => {
    const t = yawTransform(30, 1920, 1080, 3840, 2052, "cover");
    const wd = 3840 * (1080 / 2052);
    close(Math.abs(t.shiftPx), 0.4 * wd);
    assert.equal(t.clamped, true);
  });
  it("tolerates missing video metadata", () => {
    const t = yawTransform(15, 1920, 1080, 0, 0, "cover");
    assert.ok(Number.isFinite(t.scale) && t.scale > 1);
  });
});

describe("yawSourceRect (span/canvas path)", () => {
  const V = { w: 3840, h: 2052 };
  it("cover without yaw crops a centred window filling the viewport", () => {
    const r = yawSourceRect(0, 1920, 1080, V.w, V.h, "cover");
    close(r.sh, V.h);
    close(r.sw, 1920 / (1080 / 2052));
    close(r.sx, (V.w - r.sw) / 2);
    assert.deepEqual([r.dx, r.dy, r.dw, r.dh], [0, 0, 1920, 1080]);
    assert.equal(r.zoom, 1);
  });
  it("contain without yaw letter-boxes the whole frame", () => {
    const r = yawSourceRect(0, 1920, 1080, V.w, V.h, "contain");
    assert.deepEqual([r.sx, r.sy, r.sw, r.sh], [0, 0, V.w, V.h]);
    close(r.dw, 1920);
    close(r.dh, 1026);
    close(r.dy, 27);
  });
  it("yaw moves the crop toward the film edge and never leaves the frame", () => {
    for (const yaw of [15, -15, 30, -30, 45]) {
      const r = yawSourceRect(yaw, 1920, 1080, V.w, V.h, "cover");
      assert.ok(r.sx >= -1e-6 && r.sx + r.sw <= V.w + 1e-6, `yaw ${yaw} inside width`);
      assert.ok(r.sy >= -1e-6 && r.sy + r.sh <= V.h + 1e-6, `yaw ${yaw} inside height`);
      assert.ok(r.zoom > 1, `yaw ${yaw} zooms`);
      const centre = r.sx + r.sw / 2;
      if (yaw > 0) assert.ok(centre > V.w / 2, "starboard looks right");
      else assert.ok(centre < V.w / 2, "port looks left");
      // aspect preserved
      close(r.sw / r.sh, 1920 / 1080, 1e-6);
    }
  });
  it("the far edge of the yawed crop lands exactly on the base window edge", () => {
    const base = yawSourceRect(0, 1920, 1080, V.w, V.h, "cover");
    const r = yawSourceRect(15, 1920, 1080, V.w, V.h, "cover");
    close(r.sx + r.sw, base.sx + base.sw, 1e-6);
    assert.equal(r.clamped, false);
    assert.equal(yawSourceRect(30, 1920, 1080, V.w, V.h, "cover").clamped, true);
  });
});
