/** Camera-observed projected geometry. No physical distance or 3D pose is inferred. */
export type OpticalPoint = [number, number];
export interface OpticalDisplayInput { displayId: string; hardwareKey: string; pixelWidth: number; pixelHeight: number }
export interface OpticalMarkerDisplay extends OpticalDisplayInput { markerIds: [number, number, number, number]; markerSizePx: number; marginPx: number }
export interface OpticalMarkerMap {
  schemaVersion: 1; kind: "nava-optical-marker-map"; dictionary: "DICT_4X4_250";
  topologyHash: string; referencePosition: string; displays: OpticalMarkerDisplay[];
}
export interface OpticalDisplayCalibration {
  displayId: string; hardwareKey: string; markerIds: [number, number, number, number];
  activeCorners: OpticalPoint[]; normalizedCorners: OpticalPoint[]; uvToCamera: number[];
  confidence: number; rmsPx: number; independentRmsPx: number; coverage: number;
}
export interface OpticalCalibration {
  schemaVersion: 1; kind: "nava-optical-calibration"; status: "accepted"; topologyHash: string;
  mapping: OpticalMarkerMap; metric: false; source: "camera-image" | "camera-video";
  imageSize: { width: number; height: number }; coordinateSpace: "camera-pixels" | "undistorted-camera-pixels";
  referencePosition: string; displays: OpticalDisplayCalibration[]; order: string[];
  gaps: { leftDisplayId: string; rightDisplayId: string; projectedGap: number; units: "normalized-camera-width" }[];
  reasons: string[]; generatedAt?: string; cameraCalibrationSha256?: string; inputSha256?: string;
  sampledFrames?: number; acceptedFrames?: number; temporalMaxDeviationPx?: number;
}

// OpenCV DICT_4X4_250, IDs0..63, canonical inner bits row-major. Border is one black cell.
const ARUCO_BITS = [
  "1011010100110010","0000111110011010","0011001100101101","1001100101000110","0101010010011110","0111100111001101","1001111000101110","1100010011110010",
  "1111111011011010","1100111101010110","1111100110010001","0001000110100111","0000111010110111","0010101000001111","0010010010110001","0010011000111110",
  "0100011001100101","0110011000000000","0110110001011110","0111011010101111","1000011010001011","1011000000101011","1100110011010101","1101110110000010",
  "1111111001000111","1001010001110001","1010110011100100","1010010101010100","0010000100100011","0011010001101111","0100010000010101","0101011110110010",
  "1001111011001111","1111000011001011","0000100010101110","0000100100101001","0001100001110101","0000010011111111","0000110111110110","0001110001011010",
  "0001011100011000","0010101000101000","0011001010001100","0011100010110010","0010010011101000","0010111011101011","0010110100111111","0100101101100100",
  "0101000000101110","0101000000010011","0101000110010100","0101010101101000","0101110101000001","0101111110010111","0110100000000001","0110100001100111",
  "0110000100100100","0110000111101001","0110101100010010","0110111111100101","0110011111011111","0111111000011011","1000000010100000","1000001101000100",
];
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const text = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 256;
const object = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x);
export function validateOpticalMarkerMap(value: unknown): { ok: true; mapping: OpticalMarkerMap } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!object(value) || value.schemaVersion !== 1 || value.kind !== "nava-optical-marker-map" || value.dictionary !== "DICT_4X4_250" || !text(value.topologyHash) || !text(value.referencePosition) || !Array.isArray(value.displays) || !value.displays.length || value.displays.length > 16) return { ok: false, errors: ["Mapping optic invalid sau versiune incompatibilă."] };
  const displayIds = new Set<string>(), hardware = new Set<string>(), markerIds = new Set<number>();
  for (const d of value.displays) {
    if (!object(d) || !text(d.displayId) || !text(d.hardwareKey) || !Number.isInteger(d.pixelWidth) || !Number.isInteger(d.pixelHeight) || Number(d.pixelWidth) < 320 || Number(d.pixelHeight) < 240 || Number(d.pixelWidth) > 16384 || Number(d.pixelHeight) > 16384 || !Number.isInteger(d.markerSizePx) || !Number.isInteger(d.marginPx) || Number(d.markerSizePx) < 30 || Number(d.marginPx) < 5 || 2 * (Number(d.markerSizePx) + Number(d.marginPx)) >= Math.min(Number(d.pixelWidth), Number(d.pixelHeight)) || !Array.isArray(d.markerIds) || d.markerIds.length !== 4) { errors.push("Dimensiuni sau markere invalide."); continue; }
    if (displayIds.has(d.displayId) || hardware.has(d.hardwareKey)) errors.push("Display sau hardware duplicat în mapping.");
    displayIds.add(d.displayId); hardware.add(d.hardwareKey);
    for (const id of d.markerIds) {
      if (!Number.isInteger(id) || Number(id) < 0 || Number(id) >= 64 || markerIds.has(Number(id))) errors.push("Marker duplicat sau în afara dicționarului acceptat (0–63).");
      markerIds.add(Number(id));
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, mapping: value as unknown as OpticalMarkerMap };
}
export function createOpticalMarkerMap(displays: OpticalDisplayInput[], topologyHash: string, referencePosition = "Poziția de referință a publicului — de confirmat"): OpticalMarkerMap {
  const mapping: OpticalMarkerMap = { schemaVersion: 1, kind: "nava-optical-marker-map", dictionary: "DICT_4X4_250", topologyHash, referencePosition,
    displays: displays.map((d, i) => ({ ...d, markerIds: [i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 3], markerSizePx: Math.floor(Math.min(d.pixelWidth, d.pixelHeight) * 0.18), marginPx: Math.floor(Math.min(d.pixelWidth, d.pixelHeight) * 0.045) })) };
  const checked = validateOpticalMarkerMap(mapping);
  if (!checked.ok) throw new Error(checked.errors.join(" "));
  return mapping;
}
export function opticalMarkerSvg(mapping: OpticalMarkerMap, displayId: string): string {
  const checked = validateOpticalMarkerMap(mapping);
  if (!checked.ok) throw new Error(checked.errors.join(" "));
  const d = mapping.displays.find(item => item.displayId === displayId);
  if (!d) throw new Error("Display necunoscut în mapping.");
  const s = d.markerSizePx, m = d.marginPx;
  const positions = [[m, m], [d.pixelWidth - m - s, m], [d.pixelWidth - m - s, d.pixelHeight - m - s], [m, d.pixelHeight - m - s]];
  const markers = d.markerIds.map((id, i) => `<g transform="translate(${positions[i][0]} ${positions[i][1]}) scale(${s / 6})"><rect width="6" height="6" fill="black"/>${[...ARUCO_BITS[id]].map((bit, j) => bit === "1" ? `<rect x="${j % 4 + 1}" y="${Math.floor(j / 4) + 1}" width="1" height="1" fill="white"/>` : "").join("")}</g>`).join("");
  const label = d.displayId.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.pixelWidth}" height="${d.pixelHeight}" viewBox="0 0 ${d.pixelWidth} ${d.pixelHeight}"><rect width="100%" height="100%" fill="white"/><g shape-rendering="crispEdges">${markers}</g><text x="50%" y="50%" text-anchor="middle" fill="#222" font-family="sans-serif" font-size="${d.pixelHeight * 0.06}">${label}</text></svg>`;
}
function quad(value: unknown): value is OpticalPoint[] {
  if (!Array.isArray(value) || value.length !== 4 || value.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(finite))) return false;
  const crosses = value.map((p, i) => { const q = value[(i + 1) % 4], r = value[(i + 2) % 4]; return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]); });
  return crosses.every(c => c > 1e-10);
}
export function validateOpticalCalibration(value: unknown, expectedMap: OpticalMarkerMap): { ok: true; calibration: OpticalCalibration } | { ok: false; errors: string[] } {
  const expected = validateOpticalMarkerMap(expectedMap);
  if (!expected.ok) return { ok: false, errors: expected.errors };
  if (!object(value) || value.schemaVersion !== 1 || value.kind !== "nava-optical-calibration" || value.status !== "accepted" || value.metric !== false || !["camera-image", "camera-video"].includes(String(value.source)) || !["camera-pixels", "undistorted-camera-pixels"].includes(String(value.coordinateSpace)) || !object(value.imageSize) || !Number.isInteger(value.imageSize.width) || !Number.isInteger(value.imageSize.height) || Number(value.imageSize.width) < 100 || Number(value.imageSize.height) < 100 || !Array.isArray(value.reasons) || value.reasons.length || !Array.isArray(value.displays) || value.displays.length !== expectedMap.displays.length) return { ok: false, errors: ["Rezultat optic incomplet, respins sau incompatibil."] };
  const errors: string[] = [];
  if (value.coordinateSpace === "undistorted-camera-pixels" && (typeof value.cameraCalibrationSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.cameraCalibrationSha256))) errors.push("Calibrarea intrinsecă declarată nu are proveniență.");
  if (value.source === "camera-video" && (!Number.isInteger(value.acceptedFrames) || Number(value.acceptedFrames) < 3 || !Number.isInteger(value.sampledFrames) || Number(value.sampledFrames) > 15 || Number(value.sampledFrames) < Number(value.acceptedFrames) || !finite(value.temporalMaxDeviationPx) || value.temporalMaxDeviationPx < 0 || value.temporalMaxDeviationPx > 2)) errors.push("Cadrele video nu confirmă o geometrie completă și stabilă.");
  const mapping = validateOpticalMarkerMap(value.mapping);
  if (!mapping.ok || value.topologyHash !== expectedMap.topologyHash || value.referencePosition !== expectedMap.referencePosition || (mapping.ok && (mapping.mapping.topologyHash !== expectedMap.topologyHash || mapping.mapping.referencePosition !== expectedMap.referencePosition || mapping.mapping.displays.length !== expectedMap.displays.length || mapping.mapping.displays.some((d, i) => Object.keys(expectedMap.displays[i]).some(k => JSON.stringify(d[k as keyof OpticalMarkerDisplay]) !== JSON.stringify(expectedMap.displays[i][k as keyof OpticalMarkerDisplay])))))) errors.push("Topologia, hardware-ul sau mappingul markerelor nu corespunde instalației curente.");
  const width = Number(value.imageSize.width), height = Number(value.imageSize.height);
  const seen = new Set<string>();
  for (const item of value.displays) {
    if (!object(item) || !text(item.displayId) || seen.has(item.displayId)) { errors.push("Display duplicat sau invalid."); continue; }
    seen.add(item.displayId);
    const d = expectedMap.displays.find(e => e.displayId === item.displayId);
    if (!d || item.hardwareKey !== d.hardwareKey || JSON.stringify(item.markerIds) !== JSON.stringify(d.markerIds)) errors.push("Identitatea display-ului nu coincide.");
    if (item.coverage !== 1 || !finite(item.confidence) || item.confidence < 0.6 || item.confidence > 1 || !finite(item.rmsPx) || item.rmsPx < 0 || item.rmsPx > 2 || !finite(item.independentRmsPx) || item.independentRmsPx < 0 || item.independentRmsPx > 2) errors.push("Calitatea detecției sau acoperirea nu este suficientă.");
    if (!quad(item.activeCorners) || !quad(item.normalizedCorners) || !Array.isArray(item.uvToCamera) || item.uvToCamera.length !== 9 || !item.uvToCamera.every(finite)) { errors.push("Colțuri sau homografie invalide."); continue; }
    const h = item.uvToCamera;
    const denominators = [h[8], h[6] + h[8], h[6] + h[7] + h[8], h[7] + h[8]];
    if (!denominators.every(d => d > 1e-9) && !denominators.every(d => d < -1e-9)) errors.push("Homografia are o singularitate în suprafața panoului.");
    const area = Math.abs(item.activeCorners.reduce((sum, p, i) => { const q = (item.activeCorners as OpticalPoint[])[(i + 1) % 4]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    if (area < 2000) errors.push("Panoul este prea mic în fotografia de calibrare.");
    for (let i = 0; i < 4; i++) {
      const [u, v] = [[0, 0], [1, 0], [1, 1], [0, 1]][i];
      const divisor = h[6] * u + h[7] * v + h[8];
      const x = (h[0] * u + h[1] * v + h[2]) / divisor, y = (h[3] * u + h[4] * v + h[5]) / divisor;
      const [nx, ny] = item.normalizedCorners[i], [px, py] = item.activeCorners[i];
      if (Math.abs(divisor) < 1e-9 || !finite(x) || !finite(y) || nx < 0 || nx > 1 || ny < 0 || ny > 1 || Math.hypot((x - nx) * width, (y - ny) * height) > 2 || Math.hypot(nx * width - px, ny * height - py) > 2) errors.push("Homografia nu reproduce colțurile observate sau panoul iese din fotografie.");
    }
  }
  const order = [...value.displays].filter(object).sort((a, b) => {
    const center = (d: Record<string, unknown>) => quad(d.normalizedCorners) ? d.normalizedCorners.reduce((s, p) => s + p[0], 0) / 4 : 0;
    return center(a) - center(b);
  }).map(d => d.displayId);
  if (JSON.stringify(value.order) !== JSON.stringify(order) || !Array.isArray(value.gaps) || value.gaps.length !== Math.max(0, order.length - 1)) errors.push("Ordine sau goluri proiectate invalide.");
  else for (let i = 0; i < value.gaps.length; i++) {
    const gap = value.gaps[i];
    if (!object(gap) || gap.leftDisplayId !== order[i] || gap.rightDisplayId !== order[i + 1] || gap.units !== "normalized-camera-width" || !finite(gap.projectedGap) || Math.abs(gap.projectedGap) > 1) errors.push("Gol proiectat invalid.");
    else {
      const left = value.displays.find(d => object(d) && d.displayId === order[i]);
      const right = value.displays.find(d => object(d) && d.displayId === order[i + 1]);
      if (!object(left) || !object(right) || !quad(left.normalizedCorners) || !quad(right.normalizedCorners)) continue;
      const calculated = (right.normalizedCorners[0][0] + right.normalizedCorners[3][0] - left.normalizedCorners[1][0] - left.normalizedCorners[2][0]) / 2;
      if (Math.abs(calculated - gap.projectedGap) * width > 2) errors.push("Golul declarat nu corespunde colțurilor observate.");
    }
  }
  return errors.length ? { ok: false, errors: [...new Set(errors)] } : { ok: true, calibration: value as unknown as OpticalCalibration };
}

/** Normalize the shared photographed wall bounds for fragment-shader source sampling. */
export function opticalWallGeometry(calibration: OpticalCalibration): {
  bounds: { x: number; y: number; width: number; height: number };
  panels: { displayId: string; uvToWall: number[]; corners: OpticalPoint[] }[];
} {
  const points = calibration.displays.flatMap(d => d.normalizedCorners);
  const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]));
  const width = Math.max(...points.map(p => p[0])) - x, height = Math.max(...points.map(p => p[1])) - y;
  if (!(width > 0) || !(height > 0)) throw new Error("Suprafață optică degenerată.");
  return { bounds: { x, y, width, height }, panels: calibration.displays.map(d => {
    const h = d.uvToCamera;
    return { displayId: d.displayId,
      uvToWall: [(h[0]-x*h[6])/width,(h[1]-x*h[7])/width,(h[2]-x*h[8])/width,(h[3]-y*h[6])/height,(h[4]-y*h[7])/height,(h[5]-y*h[8])/height,h[6],h[7],h[8]],
      corners: d.normalizedCorners.map(([u,v]) => [(u-x)/width,(v-y)/height] as OpticalPoint),
    };
  }) };
}
