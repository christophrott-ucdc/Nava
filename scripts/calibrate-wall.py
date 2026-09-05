#!/usr/bin/env python3
"""Explicit file-based camera calibration. Never opens a camera device or a network URL."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
from pathlib import Path
import sys
import tempfile
from datetime import datetime, timezone

EXTRA_PACKAGES = Path(os.environ.get("NAVA_OPTICAL_PYTHON_PATH", str(Path(os.environ.get("LOCALAPPDATA", Path.home())) / "NavaPlayer" / "optical-python-packages")))
if EXTRA_PACKAGES.is_dir():
    sys.path.insert(0, str(EXTRA_PACKAGES))
try:
    import cv2
    import numpy as np
except ImportError as error:
    raise SystemExit("OpenCV/numpy missing. Install opencv-contrib-python-headless==4.12.0.88 and numpy in an isolated environment. " + str(error))

DICTIONARY = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_250)
PARAMETERS = cv2.aruco.DetectorParameters()
PARAMETERS.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
PARAMETERS.minMarkerPerimeterRate = 0.005
DETECTOR = cv2.aruco.ArucoDetector(DICTIONARY, PARAMETERS)


def validate_mapping(mapping):
    if not isinstance(mapping, dict) or mapping.get("schemaVersion") != 1 or mapping.get("kind") != "nava-optical-marker-map" or mapping.get("dictionary") != "DICT_4X4_250":
        raise ValueError("Incompatible marker mapping")
    for field in ("topologyHash", "referencePosition"):
        if not isinstance(mapping.get(field), str) or not 1 <= len(mapping[field]) <= 256:
            raise ValueError("Missing topology/reference identity")
    displays = mapping.get("displays")
    if not isinstance(displays, list) or not 1 <= len(displays) <= 16:
        raise ValueError("Expected 1..16 explicitly mapped displays")
    identities, hardware, markers = set(), set(), set()
    for display in displays:
        if not isinstance(display, dict):
            raise ValueError("Invalid display mapping")
        for field, found in (("displayId", identities), ("hardwareKey", hardware)):
            value = display.get(field)
            if not isinstance(value, str) or not 1 <= len(value) <= 256 or value in found:
                raise ValueError("Missing/duplicate display or hardware identity")
            found.add(value)
        for field, lo, hi in (("pixelWidth", 320, 16384), ("pixelHeight", 240, 16384), ("markerSizePx", 30, 8192), ("marginPx", 5, 8192)):
            value = display.get(field)
            if type(value) is not int or not lo <= value <= hi:
                raise ValueError("Invalid pixel/marker dimensions")
        if 2 * (display["markerSizePx"] + display["marginPx"]) >= min(display["pixelWidth"], display["pixelHeight"]):
            raise ValueError("Overlapping marker positions")
        ids = display.get("markerIds")
        if not isinstance(ids, list) or len(ids) != 4:
            raise ValueError("Four distinct markers required per display")
        for marker in ids:
            if type(marker) is not int or not 0 <= marker < 64 or marker in markers:
                raise ValueError("Duplicate/out-of-range marker ID")
            markers.add(marker)
    return mapping


def marker_positions(display):
    w, h, s, m = (display[k] for k in ("pixelWidth", "pixelHeight", "markerSizePx", "marginPx"))
    return [(m, m), (w - m - s, m), (w - m - s, h - m - s), (m, h - m - s)]


def marker_source_corners(display):
    size = display["markerSizePx"]
    # Detector corners refer to centers of the outer raster pixels, not the outside of the final pixel.
    return [np.float32([[x, y], [x + size - 1, y], [x + size - 1, y + size - 1], [x, y + size - 1]]) for x, y in marker_positions(display)]


def pattern(display):
    image = np.full((display["pixelHeight"], display["pixelWidth"]), 255, dtype=np.uint8)
    size = display["markerSizePx"]
    for marker, (x, y) in zip(display["markerIds"], marker_positions(display)):
        image[y:y+size, x:x+size] = cv2.aruco.generateImageMarker(DICTIONARY, marker, size)
    return image


def project(points, matrix):
    return cv2.perspectiveTransform(np.float32(points).reshape(1, -1, 2), matrix)[0]


def rms(actual, expected):
    return float(np.sqrt(np.mean(np.sum((actual - expected) ** 2, axis=1))))


def analyse(image, mapping, intrinsics=None):
    validate_mapping(mapping)
    height, width = image.shape[:2]
    if min(height, width) < 100 or max(height, width) > 32768:
        raise ValueError("Unsupported camera image dimensions")
    if intrinsics is not None:
        if intrinsics.get("imageSize") != {"width": width, "height": height}:
            raise ValueError("Intrinsics imageSize differs from the input; rescale/recalibrate explicitly")
        camera = np.asarray(intrinsics["cameraMatrix"], dtype=float)
        distortion = np.asarray(intrinsics["distCoeffs"], dtype=float)
        error = intrinsics.get("reprojectionErrorPx")
        if camera.shape != (3, 3) or distortion.ndim != 1 or len(distortion) not in (4, 5, 8, 12, 14) or not np.isfinite(camera).all() or not np.isfinite(distortion).all() or camera[0, 0] <= 0 or camera[1, 1] <= 0 or not isinstance(error, (int, float)) or not 0 <= error <= 2:
            raise ValueError("Invalid/unqualified camera intrinsic calibration")
        image = cv2.undistort(image, camera, distortion)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    corners, ids, _ = DETECTOR.detectMarkers(gray)
    observations = {}
    reasons = []
    expected_ids = {marker for display in mapping["displays"] for marker in display["markerIds"]}
    for marker, detected in zip([] if ids is None else ids.flatten().tolist(), corners):
        if marker not in expected_ids:
            reasons.append(f"Unmapped marker {marker} visible; use only the current calibration patterns")
        elif marker in observations:
            reasons.append(f"Duplicate marker {marker}; possible mirror/reflection or duplicate pattern")
        else:
            observations[marker] = detected.reshape(4, 2)
    displays = []
    for display in mapping["displays"]:
        missing = [marker for marker in display["markerIds"] if marker not in observations]
        if missing:
            reasons.append(f"{display['displayId']}: missing markers {missing}")
            continue
        source_blocks = marker_source_corners(display)
        target_blocks = [observations[marker] for marker in display["markerIds"]]
        minimum_side = min(float(np.linalg.norm(block[(i + 1) % 4] - block[i])) for block in target_blocks for i in range(4))
        if minimum_side < 16:
            reasons.append(f"{display['displayId']}: markers too small ({minimum_side:.1f}px); move camera/use higher resolution")
            continue
        source, target = np.concatenate(source_blocks), np.concatenate(target_blocks)
        matrix, mask = cv2.findHomography(source, target, cv2.RANSAC, 2.0)
        if matrix is None or not np.isfinite(matrix).all() or abs(np.linalg.det(matrix)) < 1e-12 or mask is None or int(mask.sum()) != 16:
            reasons.append(f"{display['displayId']}: inconsistent marker geometry or reflection")
            continue
        residual = rms(project(source, matrix), target)
        held_out = []
        for exclude in range(4):
            train_source = np.concatenate([block for i, block in enumerate(source_blocks) if i != exclude])
            train_target = np.concatenate([block for i, block in enumerate(target_blocks) if i != exclude])
            training_matrix, _ = cv2.findHomography(train_source, train_target, 0)
            if training_matrix is None:
                held_out.append(float("inf"))
            else:
                held_out.append(rms(project(source_blocks[exclude], training_matrix), target_blocks[exclude]))
        independent_error = max(held_out)
        if residual > 2 or independent_error > 2:
            reasons.append(f"{display['displayId']}: reprojection RMS {residual:.2f}px / held-out {independent_error:.2f}px exceeds 2px")
            continue
        active = project([[0, 0], [display["pixelWidth"], 0], [display["pixelWidth"], display["pixelHeight"]], [0, display["pixelHeight"]]], matrix)
        if not np.isfinite(active).all() or not cv2.isContourConvex(active) or cv2.contourArea(active, oriented=True) <= 2000 or np.any(active < 0) or np.any(active[:, 0] > width) or np.any(active[:, 1] > height):
            reasons.append(f"{display['displayId']}: active panel corners not fully visible/convex")
            continue
        normalized = active / np.array([width, height])
        uv_matrix = np.diag([1 / width, 1 / height, 1]) @ matrix @ np.diag([display["pixelWidth"], display["pixelHeight"], 1])
        uv_matrix /= uv_matrix[2, 2]
        confidence = min(0.95 if intrinsics else 0.85, 1 - independent_error / 8, minimum_side / 32)
        if confidence < 0.6:
            reasons.append(f"{display['displayId']}: detection confidence below 0.6")
            continue
        displays.append({"displayId": display["displayId"], "hardwareKey": display["hardwareKey"], "markerIds": display["markerIds"],
                         "activeCorners": active.tolist(), "normalizedCorners": normalized.tolist(), "uvToCamera": uv_matrix.flatten().tolist(),
                         "confidence": round(confidence, 6), "rmsPx": residual, "independentRmsPx": independent_error, "coverage": 1})
    ordered = sorted(displays, key=lambda d: np.mean(np.array(d["normalizedCorners"])[:, 0]))
    gaps = []
    for left, right in zip(ordered, ordered[1:]):
        left_edge = np.mean(np.array(left["normalizedCorners"])[[1, 2], 0])
        right_edge = np.mean(np.array(right["normalizedCorners"])[[0, 3], 0])
        gaps.append({"leftDisplayId": left["displayId"], "rightDisplayId": right["displayId"], "projectedGap": float(right_edge - left_edge), "units": "normalized-camera-width"})
    return {"schemaVersion": 1, "kind": "nava-optical-calibration", "status": "accepted" if not reasons and len(displays) == len(mapping["displays"]) else "rejected",
            "generatedAt": datetime.now(timezone.utc).isoformat(), "topologyHash": mapping["topologyHash"], "mapping": mapping, "metric": False,
            "source": "camera-image", "imageSize": {"width": width, "height": height}, "coordinateSpace": "undistorted-camera-pixels" if intrinsics else "camera-pixels",
            "referencePosition": mapping["referencePosition"], "displays": displays, "order": [d["displayId"] for d in ordered], "gaps": gaps, "reasons": reasons,
            "qualityPolicy": {"maxRmsPx": 2, "maxHeldOutMarkerRmsPx": 2, "minMarkerSidePx": 16, "allMarkersRequired": True, "confidenceIsProbability": False}}


def analyse_file(source, mapping, intrinsics=None):
    source = Path(source).resolve()
    if not source.is_file():
        raise ValueError("Input must be an existing photograph/video file; cameras and URLs are not accepted")
    image = cv2.imread(str(source))
    if image is not None:
        result = analyse(image, mapping, intrinsics)
    else:
        capture = cv2.VideoCapture(str(source))
        try:
            count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
            if not capture.isOpened() or count < 3:
                raise ValueError("Video cannot be decoded or has fewer than 3 frames")
            accepted, rejected = [], []
            for frame in np.unique(np.linspace(0, count - 1, min(15, count), dtype=int)):
                capture.set(cv2.CAP_PROP_POS_FRAMES, int(frame))
                ok, image = capture.read()
                if not ok:
                    rejected.append("Frame decode failed")
                    continue
                candidate = analyse(image, mapping, intrinsics)
                (accepted if candidate["status"] == "accepted" else rejected).append(candidate)
            if len(accepted) < 3:
                result = accepted[0] if accepted else next((r for r in rejected if isinstance(r, dict)), None)
                if result is None:
                    raise ValueError("No decodable video frames")
                result["status"] = "rejected"
                result["reasons"].append("At least 3 complete, consistent calibration frames required")
            else:
                result = min(accepted, key=lambda r: max(d["independentRmsPx"] for d in r["displays"]))
                points = np.array([[d["activeCorners"] for d in r["displays"]] for r in accepted])
                center = np.median(points, axis=0)
                max_motion = float(np.max(np.linalg.norm(points - center, axis=-1)))
                result["temporalMaxDeviationPx"] = max_motion
                if max_motion > 2:
                    result["status"] = "rejected"
                    result["reasons"].append(f"Camera/panels moved between frames ({max_motion:.2f}px > 2px)")
                if any(isinstance(r, dict) and any("Duplicate marker" in reason for reason in r["reasons"]) for r in rejected):
                    result["status"] = "rejected"
                    result["reasons"].append("Duplicate/reflected marker occurred in sampled video frames")
            result["source"] = "camera-video"
            result["sampledFrames"] = len(accepted) + len(rejected)
            result["acceptedFrames"] = len(accepted)
        finally:
            capture.release()
    with source.open("rb") as stream:
        result["inputSha256"] = hashlib.file_digest(stream, "sha256").hexdigest()
    if intrinsics:
        result["cameraCalibrationSha256"] = hashlib.sha256(json.dumps(intrinsics, sort_keys=True).encode()).hexdigest()
    return result


def synthetic_mapping(count=2):
    return {"schemaVersion": 1, "kind": "nava-optical-marker-map", "dictionary": "DICT_4X4_250", "topologyHash": "synthetic-test-only", "referencePosition": "Synthetic reference, not a physical installation",
            "displays": [{"displayId": f"tv-{i}", "hardwareKey": f"test-device-{i}", "pixelWidth": 640, "pixelHeight": 360, "markerIds": [4*i+j for j in range(4)], "markerSizePx": 64, "marginPx": 20} for i in range(count)]}


def self_test(output_dir=None):
    mapping = synthetic_mapping()
    image = np.full((600, 1600), 60, dtype=np.uint8)
    for i, display in enumerate(mapping["displays"]):
        image[100:460, 80+i*740:720+i*740] = pattern(display)
    normal = analyse(image, mapping)
    assert normal["status"] == "accepted", normal["reasons"]
    assert normal["order"] == ["tv-0", "tv-1"] and abs(normal["gaps"][0]["projectedGap"] - 100/1600) < 0.003
    missing = image.copy(); missing[110:190, 90:170] = 255
    assert analyse(missing, mapping)["status"] == "rejected"
    duplicate = image.copy(); duplicate[490:554, 100:164] = cv2.aruco.generateImageMarker(DICTIONARY, 0, 64)
    duplicate[480:490, 90:174] = 255; duplicate[554:564, 90:174] = 255; duplicate[480:564, 90:100] = 255; duplicate[480:564, 164:174] = 255
    assert any("Duplicate" in reason for reason in analyse(duplicate, mapping)["reasons"])
    transform = cv2.getPerspectiveTransform(np.float32([[0,0],[1599,0],[1599,599],[0,599]]), np.float32([[70,30],[1530,70],[1580,550],[25,585]]))
    perspective = cv2.warpPerspective(image, transform, (1600,600), borderValue=60)
    projected = analyse(perspective, mapping)
    assert projected["status"] == "accepted", projected["reasons"]
    expected = project([[80,100],[720,100],[720,460],[80,460]], transform)
    assert rms(np.array(projected["displays"][0]["activeCorners"]), expected) < 2
    inconsistent = image.copy(); inconsistent[120:184,100:164] = 255; inconsistent[125:189,110:174] = cv2.aruco.generateImageMarker(DICTIONARY,0,64)
    assert analyse(inconsistent,mapping)["status"] == "rejected"
    bad_map = json.loads(json.dumps(mapping)); bad_map["displays"][1]["markerIds"][0] = 0
    try:
        validate_mapping(bad_map)
        raise AssertionError("Duplicate mapping accepted")
    except ValueError:
        pass
    source_text = (Path(__file__).resolve().parent.parent/"src/shared/optical-calibration.ts").read_text(encoding="utf8")
    svg_bits = re.findall(r'"([01]{16})"', source_text)
    expected_bits = ["".join(str(int(bit > 0)) for bit in cv2.aruco.generateImageMarker(DICTIONARY,i,6)[1:5,1:5].flatten()) for i in range(64)]
    assert svg_bits == expected_bits, "Browser SVG dictionary differs from the detector"
    intrinsics = {"imageSize":{"width":1600,"height":600},"cameraMatrix":[[1300,0,800],[0,1300,300],[0,0,1]],"distCoeffs":[0,0,0,0,0],"reprojectionErrorPx":0.5}
    corrected = analyse(image,mapping,intrinsics)
    assert corrected["status"] == "accepted" and corrected["coordinateSpace"] == "undistorted-camera-pixels"
    maximum_map = synthetic_mapping(16)
    maximum_image = np.full((500, 16*700+100),60,dtype=np.uint8)
    for i,display in enumerate(maximum_map["displays"]): maximum_image[70:430,50+i*700:690+i*700] = pattern(display)
    assert analyse(maximum_image,maximum_map)["status"] == "accepted"
    with tempfile.TemporaryDirectory(prefix="nava-optical-test-") as temp:
        video = Path(temp)/"static.avi"
        writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*"MJPG"), 5, (1600,600))
        assert writer.isOpened()
        for _ in range(5): writer.write(cv2.cvtColor(image,cv2.COLOR_GRAY2BGR))
        writer.release()
        assert analyse_file(video,mapping)["status"] == "accepted"
        moving = Path(temp)/"moving.avi"
        writer = cv2.VideoWriter(str(moving),cv2.VideoWriter_fourcc(*"MJPG"),5,(1600,600))
        assert writer.isOpened()
        for i in range(5):
            shifted = cv2.warpAffine(image,np.float32([[1,0,i*4],[0,1,0]]),(1600,600),borderValue=60)
            writer.write(cv2.cvtColor(shifted,cv2.COLOR_GRAY2BGR))
        writer.release()
        moving_result = analyse_file(moving,mapping)
        assert moving_result["status"] == "rejected" and any("moved" in reason for reason in moving_result["reasons"])
    if output_dir:
        output_dir = Path(output_dir).resolve(); output_dir.mkdir(parents=True, exist_ok=True)
        for name, img in (("synthetic-wall.png",image),("synthetic-perspective.png",perspective),("synthetic-missing.png",missing),("synthetic-duplicate.png",duplicate)):
            cv2.imwrite(str(output_dir/name),img)
        (output_dir/"marker-map.json").write_text(json.dumps(mapping,ensure_ascii=False,indent=2),encoding="utf8")
        (output_dir/"calibration.json").write_text(json.dumps(projected,ensure_ascii=False,indent=2),encoding="utf8")
    print(json.dumps({"passed": 12, "tests": ["real ArUco detection", "projected gap/order", "missing rejection", "duplicate rejection", "perspective held-out verification", "inconsistent geometry rejection", "duplicate mapping rejection", "browser SVG dictionary parity", "intrinsic correction", "16-panel real marker detection", "video complete static frames", "moving video rejection"], "opencv": cv2.__version__, "numpy": np.__version__}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mapping", type=Path); parser.add_argument("--input", type=Path); parser.add_argument("--output", type=Path)
    parser.add_argument("--intrinsics", type=Path); parser.add_argument("--patterns", type=Path, help="Generate display PNG patterns in this directory")
    parser.add_argument("--self-test", action="store_true"); parser.add_argument("--test-output", type=Path)
    args = parser.parse_args()
    if args.self_test:
        self_test(args.test_output); return 0
    if not args.mapping:
        parser.error("--mapping is required")
    mapping = validate_mapping(json.loads(args.mapping.read_text(encoding="utf-8-sig")))
    if args.patterns:
        args.patterns.mkdir(parents=True, exist_ok=True)
        for i, display in enumerate(mapping["displays"]):
            cv2.imwrite(str(args.patterns/f"display-{i:02d}.png"), pattern(display))
        print(json.dumps({"patterns":len(mapping["displays"]),"directory":str(args.patterns.resolve())})); return 0
    if not args.input or not args.output:
        parser.error("--input and --output are required")
    if args.output.resolve() in [args.input.resolve(), args.mapping.resolve()] or (args.intrinsics and args.output.resolve() == args.intrinsics.resolve()):
        raise ValueError("Output must not overwrite input/mapping/intrinsics")
    intrinsics = json.loads(args.intrinsics.read_text(encoding="utf-8-sig")) if args.intrinsics else None
    result = analyse_file(args.input, mapping, intrinsics)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix+".tmp")
    temporary.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False)+"\n",encoding="utf8")
    temporary.replace(args.output)
    print(json.dumps({"status":result["status"],"panels":len(result["displays"]),"reasons":result["reasons"]},ensure_ascii=False))
    return 0 if result["status"] == "accepted" else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, OSError, cv2.error) as error:
        print("Calibration failed: " + str(error),file=sys.stderr)
        raise SystemExit(1)
