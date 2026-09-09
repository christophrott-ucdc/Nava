import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClipsRouter } from "./clips";

const IDS = ["port-outer", "port-inner", "center", "starboard-inner", "starboard-outer"];

function fixture(files: Record<string, Buffer | string>) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "nava-clips-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(dir, name), body);
  const app = createClipsRouter({ dir: () => dir, screenIds: () => IDS, log: () => undefined });
  return { dir, app, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("listarea raporteaza ce lipseste fara sa eșueze", async () => {
  const f = fixture({ "center.mp4": "0123456789" });
  try {
    const res = await f.app.request("/");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; panels: Array<{ screenId: string; exists: boolean }>; issues: string[] };
    assert.equal(body.ok, true, "un singur clip prezent e suficient ca sa fie utilizabil");
    assert.equal(body.panels.length, 5);
    assert.equal(body.panels.filter((p) => p.exists).length, 1);
    // Cele patru absente trebuie numite, ca operatorul sa stie ce sa produca.
    assert.equal(body.issues.filter((i) => i.startsWith("lipsește")).length, 4);
  } finally {
    f.cleanup();
  }
});

test("panelsDir nesetat nu arunca, doar explica", async () => {
  const app = createClipsRouter({ dir: () => undefined, screenIds: () => IDS, log: () => undefined });
  const res = await app.request("/");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; reason: string; panels: unknown[] };
  assert.equal(body.ok, false);
  assert.match(body.reason, /panelsDir/);
  assert.deepEqual(body.panels, []);
});

test("cererea fara Range livreaza tot fisierul si anunta Accept-Ranges", async () => {
  const f = fixture({ "center.mp4": "0123456789" });
  try {
    const res = await f.app.request("/center/media");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("accept-ranges"), "bytes");
    assert.equal(res.headers.get("content-length"), "10");
    assert.equal(await res.text(), "0123456789");
  } finally {
    f.cleanup();
  }
});

test("Range returneaza 206 cu Content-Range si exact octetii ceruti", async () => {
  const f = fixture({ "center.mp4": "0123456789" });
  try {
    const res = await f.app.request("/center/media", { headers: { Range: "bytes=2-5" } });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-range"), "bytes 2-5/10");
    assert.equal(res.headers.get("content-length"), "4");
    assert.equal(await res.text(), "2345");
  } finally {
    f.cleanup();
  }
});

test("Range deschis la dreapta merge pana la capat", async () => {
  const f = fixture({ "center.mp4": "0123456789" });
  try {
    const res = await f.app.request("/center/media", { headers: { Range: "bytes=7-" } });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-range"), "bytes 7-9/10");
    assert.equal(await res.text(), "789");
  } finally {
    f.cleanup();
  }
});

test("Range sufix cere ultimii N octeti", async () => {
  const f = fixture({ "center.mp4": "0123456789" });
  try {
    const res = await f.app.request("/center/media", { headers: { Range: "bytes=-3" } });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-range"), "bytes 7-9/10");
    assert.equal(await res.text(), "789");
  } finally {
    f.cleanup();
  }
});

test("Range imposibil da 416, nu un corp trunchiat", async () => {
  const f = fixture({ "center.mp4": "0123456789" });
  try {
    for (const range of ["bytes=50-60", "bytes=5-2", "bytes=-", "octeti=0-1"]) {
      const res = await f.app.request("/center/media", { headers: { Range: range } });
      assert.equal(res.status, 416, `"${range}" ar trebui respins`);
      assert.equal(res.headers.get("content-range"), "bytes */10");
    }
  } finally {
    f.cleanup();
  }
});

test("HEAD anunta lungimea fara corp, ca <video> sa poata cere range-uri", async () => {
  const f = fixture({ "center.mp4": "0123456789" });
  try {
    const res = await f.app.request("/center/media", { method: "HEAD" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-length"), "10");
    assert.equal(res.headers.get("accept-ranges"), "bytes");
    assert.equal((await res.text()).length, 0);
  } finally {
    f.cleanup();
  }
});

test("id-urile din afara configului sunt respinse: numele ajunge in path.join", async () => {
  const f = fixture({ "center.mp4": "0123456789", "secret.mp4": "nu" });
  try {
    for (const id of ["secret", "..", "..%2F..%2Fconfig", "center%00"]) {
      const res = await f.app.request(`/${id}/media`);
      assert.equal(res.status, 404, `"${id}" nu trebuie servit`);
    }
  } finally {
    f.cleanup();
  }
});

test("clipul absent da 404, nu 500", async () => {
  const f = fixture({});
  try {
    const res = await f.app.request("/center/media");
    assert.equal(res.status, 404);
  } finally {
    f.cleanup();
  }
});
