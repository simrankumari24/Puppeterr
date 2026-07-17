#!/usr/bin/env python3
"""
OpenCV-based shape detector
Detects circles, rectangles, triangles, and other polygons in images
"""

import sys
import json
import base64
import cv2
import numpy as np


def _clamp01(value):
    return max(0.0, min(1.0, float(value)))


def _color_hex_from_mask(img, mask):
    color_pixels = img[mask == 255]
    if len(color_pixels) == 0:
        return "#808080"
    avg_color = color_pixels.mean(axis=0)
    return "#{:02x}{:02x}{:02x}".format(int(avg_color[2]), int(avg_color[1]), int(avg_color[0]))


def _bbox_iou(a, b):
    ax1, ay1, aw, ah = a["x"], a["y"], a["width"], a["height"]
    bx1, by1, bw, bh = b["x"], b["y"], b["width"], b["height"]
    ax2, ay2 = ax1 + aw, ay1 + ah
    bx2, by2 = bx1 + bw, by1 + bh

    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    iw = max(0, ix2 - ix1)
    ih = max(0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    union = (aw * ah) + (bw * bh) - inter
    if union <= 0:
        return 0.0
    return inter / float(union)


def _distance(p1, p2):
    dx = float(p1["x"]) - float(p2["x"])
    dy = float(p1["y"]) - float(p2["y"])
    return float(np.hypot(dx, dy))


def _shape_priority(shape):
    shape_type = shape.get("type", "")
    confidence = float(shape.get("confidence", 0.0))
    area = float(shape.get("area", 0.0))

    # Prefer specific geometric labels over generic polygon fallbacks.
    is_generic = 1 if shape_type.startswith("polygon_") else 0
    return (is_generic, -confidence, -area)


def _compatible_type(t1, t2):
    if t1 == t2:
        return True
    circle_like = {"circle", "ellipse"}
    box_like = {"square", "rectangle"}
    if t1 in circle_like and t2 in circle_like:
        return True
    if t1 in box_like and t2 in box_like:
        return True
    return False


def _dedupe_shapes(shapes):
    if not shapes:
        return []

    kept = []
    for shape in sorted(shapes, key=_shape_priority):
        is_duplicate = False
        for existing in kept:
            iou = _bbox_iou(shape["bbox"], existing["bbox"])
            near_center = _distance(shape["center"], existing["center"]) < 8
            same_type = shape["type"] == existing["type"]
            area1 = max(1.0, float(shape.get("area", 0.0)))
            area2 = max(1.0, float(existing.get("area", 0.0)))
            area_ratio = min(area1, area2) / max(area1, area2)
            overlaps_strong = iou > 0.72 and near_center and area_ratio > 0.62
            if (same_type and iou > 0.55) or (near_center and iou > 0.35) or overlaps_strong:
                is_duplicate = True
                break
        if not is_duplicate:
            kept.append(shape)

    return kept


def _contour_sources(smooth, binary):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))

    canny_map = _auto_canny(smooth)
    canny_map = cv2.morphologyEx(canny_map, cv2.MORPH_CLOSE, k, iterations=1)

    adapt_map = cv2.adaptiveThreshold(
        smooth,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        3,
    )
    adapt_edges = cv2.bitwise_xor(adapt_map, cv2.morphologyEx(adapt_map, cv2.MORPH_OPEN, k, iterations=1))
    adapt_edges = cv2.morphologyEx(adapt_edges, cv2.MORPH_CLOSE, k, iterations=1)

    # Primary map has the highest trust; aux maps improve consensus.
    return [
        ("primary", binary, 1.00),
        ("canny", canny_map, 0.92),
        ("adaptive", adapt_edges, 0.88),
    ]


def _consensus_support_counts(shapes):
    n = len(shapes)
    if n == 0:
        return []

    counts = [1] * n
    for i in range(n):
        for j in range(i + 1, n):
            si = shapes[i]
            sj = shapes[j]

            # We only gain support from other contour sources.
            if si.get("_source") == sj.get("_source"):
                continue

            if not _compatible_type(si.get("type", ""), sj.get("type", "")):
                continue

            iou = _bbox_iou(si["bbox"], sj["bbox"])
            near_center = _distance(si["center"], sj["center"]) < 13
            if iou > 0.33 or (near_center and iou > 0.14):
                counts[i] += 1
                counts[j] += 1

    return counts


def _auto_canny(gray):
    median = np.median(gray)
    lower = int(max(0, 0.66 * median))
    upper = int(min(255, 1.33 * median))
    return cv2.Canny(gray, lower, upper)


def _preprocess(gray):
    h, w = gray.shape[:2]
    diag = max(1.0, float(np.hypot(h, w)))
    blur_k = int(max(3, round(diag / 350)))
    if blur_k % 2 == 0:
        blur_k += 1

    denoised = cv2.bilateralFilter(gray, d=7, sigmaColor=55, sigmaSpace=55)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    smoothed = cv2.GaussianBlur(enhanced, (blur_k, blur_k), 0)

    edges = _auto_canny(smoothed)
    _, thresh_otsu = cv2.threshold(smoothed, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    thresh_adapt = cv2.adaptiveThreshold(
        smoothed,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        3,
    )

    # Keep only the strongest transitions and remove textured interiors.
    combined = cv2.bitwise_or(edges, cv2.bitwise_xor(thresh_otsu, thresh_adapt))
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, k, iterations=2)
    combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, k, iterations=1)
    return smoothed, combined


def _stable_polygon(contour, perimeter):
    if perimeter <= 0:
        return None

    # Build approximations at multiple epsilons and pick the most stable one.
    candidates = []
    for ratio in (0.009, 0.012, 0.016, 0.022):
        approx = cv2.approxPolyDP(contour, ratio * perimeter, True)
        candidates.append(approx)

    valid = [a for a in candidates if len(a) >= 3]
    if not valid:
        return None

    # Prefer convex polygons for cleaner geometry classification.
    convex = [a for a in valid if cv2.isContourConvex(a)]
    pool = convex if convex else valid
    pool.sort(key=lambda a: abs(len(a) - 4))
    return pool[0]


def _contour_quality(features):
    area = features["area"]
    perimeter = features["perimeter"]
    solidity = features["solidity"]
    extent = features["extent"]
    circularity = features["circularity"]
    vertices = features["vertices"]

    compactness = (4.0 * np.pi * area / (perimeter * perimeter)) if perimeter > 0 else 0.0
    quality = 0.0
    quality += 0.30 * _clamp01(solidity)
    quality += 0.26 * _clamp01(extent)
    quality += 0.24 * _clamp01(circularity)
    quality += 0.20 * _clamp01(compactness)

    # Penalize over-fragmented contours.
    if vertices >= 10:
        quality -= 0.12
    if vertices >= 14:
        quality -= 0.15

    return _clamp01(quality)


def _angle_degrees(a, b, c):
    ba = a - b
    bc = c - b
    na = np.linalg.norm(ba)
    nc = np.linalg.norm(bc)
    if na <= 1e-6 or nc <= 1e-6:
        return None
    cosv = float(np.dot(ba, bc) / (na * nc))
    cosv = max(-1.0, min(1.0, cosv))
    return float(np.degrees(np.arccos(cosv)))


def _polygon_geometry(approx):
    pts = np.squeeze(approx, axis=1).astype(np.float32)
    if len(pts.shape) != 2 or pts.shape[0] < 3:
        return {
            "angle_mean_abs_error_90": None,
            "angle_std": None,
            "side_uniformity": None,
            "radial_cv": None,
        }

    n = pts.shape[0]
    side_lengths = []
    angles = []

    for i in range(n):
        p_prev = pts[(i - 1) % n]
        p_curr = pts[i]
        p_next = pts[(i + 1) % n]
        side_lengths.append(float(np.linalg.norm(p_next - p_curr)))
        ang = _angle_degrees(p_prev, p_curr, p_next)
        if ang is not None:
            angles.append(ang)

    side_uniformity = None
    if side_lengths:
        side_mean = float(np.mean(side_lengths))
        if side_mean > 1e-6:
            side_uniformity = _clamp01(1.0 - float(np.std(side_lengths) / side_mean))

    angle_std = float(np.std(angles)) if angles else None
    angle_mean_abs_error_90 = None
    if angles:
        angle_mean_abs_error_90 = float(np.mean([abs(a - 90.0) for a in angles]))

    center = np.mean(pts, axis=0)
    radial = np.linalg.norm(pts - center, axis=1)
    radial_cv = None
    radial_mean = float(np.mean(radial)) if len(radial) > 0 else 0.0
    if radial_mean > 1e-6:
        radial_cv = float(np.std(radial) / radial_mean)

    return {
        "angle_mean_abs_error_90": angle_mean_abs_error_90,
        "angle_std": angle_std,
        "side_uniformity": side_uniformity,
        "radial_cv": radial_cv,
    }


def _classify_shape(features):
    vertices = features["vertices"]
    circularity = features["circularity"]
    aspect_ratio = features["aspect_ratio"]
    extent = features["extent"]
    solidity = features["solidity"]
    fill_ratio = features["fill_ratio"]
    ellipse_axis_ratio = features["ellipse_axis_ratio"]
    angle_mean_abs_error_90 = features.get("angle_mean_abs_error_90")
    side_uniformity = features.get("side_uniformity")
    radial_cv = features.get("radial_cv")

    # Circle/Ellipse
    if circularity > 0.78 and fill_ratio > 0.70 and solidity > 0.82:
        if radial_cv is None or radial_cv <= 0.24:
            circle_bonus = 0.0
            if radial_cv is not None:
                circle_bonus = 0.12 * _clamp01(1.0 - radial_cv / 0.24)
            if ellipse_axis_ratio is not None and ellipse_axis_ratio < 0.82:
                return "ellipse", _clamp01(0.6 + 0.26 * circularity + 0.1 * solidity + circle_bonus)
            return "circle", _clamp01(0.68 + 0.2 * circularity + 0.08 * solidity + circle_bonus)

    # Triangle
    if vertices == 3:
        tri_conf = 0.58 + 0.25 * solidity + 0.17 * extent
        return "triangle", _clamp01(tri_conf)

    # Quadrilateral
    if vertices == 4:
        rectangularity = _clamp01(extent * solidity)
        right_angle_score = 0.0
        if angle_mean_abs_error_90 is not None:
            right_angle_score = _clamp01(1.0 - (angle_mean_abs_error_90 / 22.0))
        side_balance = 0.0 if side_uniformity is None else side_uniformity

        if 0.88 <= aspect_ratio <= 1.14:
            sq_conf = 0.45 + 0.28 * rectangularity + 0.17 * (1.0 - abs(1.0 - aspect_ratio)) + 0.10 * right_angle_score
            sq_conf += 0.06 * side_balance
            return "square", _clamp01(sq_conf)

        rect_conf = 0.45 + 0.3 * rectangularity + 0.15 * _clamp01(1.0 - abs(1.9 - aspect_ratio) / 3.5)
        rect_conf += 0.1 * right_angle_score
        return "rectangle", _clamp01(rect_conf)

    # Known polygons
    if vertices == 5:
        return "pentagon", _clamp01(0.48 + 0.32 * solidity + 0.2 * extent)
    if vertices == 6:
        return "hexagon", _clamp01(0.48 + 0.3 * solidity + 0.22 * extent)
    if vertices == 8:
        return "octagon", _clamp01(0.47 + 0.3 * solidity + 0.23 * extent)

    # Generic polygon fallback (kept conservative to avoid false positives)
    return f"polygon_{vertices}", _clamp01(0.42 + 0.28 * solidity + 0.2 * extent + 0.1 * _clamp01(circularity))


def _shape_features(contour, approx):
    area = float(cv2.contourArea(contour))
    perimeter = float(cv2.arcLength(contour, True))
    x, y, rw, rh = cv2.boundingRect(approx)

    moments = cv2.moments(contour)
    if moments["m00"] > 0:
        cx = int(moments["m10"] / moments["m00"])
        cy = int(moments["m01"] / moments["m00"])
    else:
        cx, cy = x + rw // 2, y + rh // 2

    hull = cv2.convexHull(contour)
    hull_area = float(cv2.contourArea(hull)) if len(hull) >= 3 else 0.0
    solidity = (area / hull_area) if hull_area > 0 else 0.0
    extent = (area / float(rw * rh)) if (rw > 0 and rh > 0) else 0.0
    circularity = (4.0 * np.pi * area / (perimeter * perimeter)) if perimeter > 0 else 0.0

    (_, _), radius = cv2.minEnclosingCircle(contour)
    enclosing_area = np.pi * (radius * radius) if radius > 0 else 0.0
    fill_ratio = (area / enclosing_area) if enclosing_area > 0 else 0.0

    ellipse_axis_ratio = None
    if len(contour) >= 5:
        (_, _), (ma, mi), _ = cv2.fitEllipse(contour)
        major = max(ma, mi)
        minor = min(ma, mi)
        if major > 0:
            ellipse_axis_ratio = float(minor / major)

    poly = _polygon_geometry(approx)

    return {
        "vertices": int(len(approx)),
        "area": area,
        "perimeter": perimeter,
        "circularity": float(circularity),
        "center": {"x": int(cx), "y": int(cy)},
        "bbox": {"x": int(x), "y": int(y), "width": int(rw), "height": int(rh)},
        "aspect_ratio": float(rw / rh) if rh > 0 else 0.0,
        "extent": float(extent),
        "solidity": float(solidity),
        "fill_ratio": float(fill_ratio),
        "ellipse_axis_ratio": float(ellipse_axis_ratio) if ellipse_axis_ratio is not None else None,
        "angle_mean_abs_error_90": poly["angle_mean_abs_error_90"],
        "angle_std": poly["angle_std"],
        "side_uniformity": poly["side_uniformity"],
        "radial_cv": poly["radial_cv"],
    }

def detect_shapes(image_b64):
    """
    Detect geometric shapes in an image
    Returns list of detected shapes with properties
    """
    try:
        # Decode base64 image
        image_data = base64.b64decode(image_b64, validate=True)
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return { "error": "Failed to decode image", "shapes": [] }
        
        # Convert to grayscale and preprocess adaptively
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        smooth, binary = _preprocess(gray)

        shapes = []
        h, w = img.shape[:2]
        image_area = float(max(1, h * w))
        min_area = max(110.0, image_area * 0.00012)
        max_area = image_area * 0.92
        contour_inputs = _contour_sources(smooth, binary)

        for source_name, contour_map, source_weight in contour_inputs:
            contours, _ = cv2.findContours(contour_map, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for contour in contours:
                area = float(cv2.contourArea(contour))

                # Filter out very small/very large contours (noise/background)
                if area < min_area or area > max_area:
                    continue

                # Approximate contour to a polygon
                perimeter = float(cv2.arcLength(contour, True))
                if perimeter == 0:
                    continue

                approx = _stable_polygon(contour, perimeter)
                if approx is None:
                    continue

                if len(approx) < 3:
                    continue

                f = _shape_features(contour, approx)
                shape_type, confidence = _classify_shape(f)
                quality = _contour_quality(f)

                # Background/frame edges are commonly detected as giant rectangles.
                bbox = f["bbox"]
                near_full_frame = (
                    bbox["x"] <= 2
                    and bbox["y"] <= 2
                    and (bbox["x"] + bbox["width"]) >= (w - 3)
                    and (bbox["y"] + bbox["height"]) >= (h - 3)
                )
                if near_full_frame:
                    continue

                # Reject unstable contours
                if f["solidity"] < 0.48 and f["extent"] < 0.26:
                    continue
                if f["circularity"] < 0.05:
                    continue
                if f["vertices"] > 12 and f.get("radial_cv") is not None and f["radial_cv"] > 0.42:
                    continue
                if quality < 0.34:
                    continue
                confidence = _clamp01((0.68 * confidence + 0.32 * quality) * source_weight)
                if confidence < 0.49:
                    continue

                # Highly fragmented polygons are usually noise unless strongly supported.
                if shape_type.startswith("polygon_") and (f["vertices"] > 8 or confidence < 0.62):
                    continue

                # Detect color (average color in contour region)
                mask = np.zeros(gray.shape, np.uint8)
                cv2.drawContours(mask, [contour], 0, 255, -1)
                color_hex = _color_hex_from_mask(img, mask)

                shapes.append({
                    "type": shape_type,
                    "vertices": f["vertices"],
                    "area": f["area"],
                    "perimeter": f["perimeter"],
                    "circularity": f["circularity"],
                    "center": f["center"],
                    "bbox": f["bbox"],
                    "color": color_hex,
                    "aspect_ratio": f["aspect_ratio"],
                    "confidence": confidence,
                    "solidity": f["solidity"],
                    "extent": f["extent"],
                    "fill_ratio": f["fill_ratio"],
                    "_source": source_name,
                })

        # Consensus pass: prefer shapes that appear in multiple contour sources.
        if shapes:
            support_counts = _consensus_support_counts(shapes)
            supported = []
            for i, s in enumerate(shapes):
                support = support_counts[i]
                base_conf = float(s.get("confidence", 0.0))
                consensus_bonus = min(0.22, 0.06 * max(0, support - 1))
                s["confidence"] = _clamp01(base_conf + consensus_bonus)

                # Keep single-source detections only when confidence is already strong.
                if support < 2 and s["confidence"] < 0.76:
                    continue
                supported.append(s)
            shapes = supported

        # Hough circle fallback for low-contrast circular objects
        circle_candidates = cv2.HoughCircles(
            smooth,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=max(16, int(min(h, w) * 0.04)),
            param1=140,
            param2=30,
            minRadius=max(6, int(min(h, w) * 0.008)),
            maxRadius=max(14, int(min(h, w) * 0.22)),
        )
        if circle_candidates is not None:
            circles = np.round(circle_candidates[0, :]).astype("int")
            for (cx, cy, radius) in circles[:24]:
                bbox = {
                    "x": int(max(0, cx - radius)),
                    "y": int(max(0, cy - radius)),
                    "width": int(min(w - 1, cx + radius) - max(0, cx - radius)),
                    "height": int(min(h - 1, cy + radius) - max(0, cy - radius)),
                }
                if bbox["width"] <= 2 or bbox["height"] <= 2:
                    continue

                area = float(np.pi * radius * radius)
                if area < min_area:
                    continue

                # Validate that local edge strength supports a true circle.
                x1 = max(0, int(cx - radius - 2))
                y1 = max(0, int(cy - radius - 2))
                x2 = min(w, int(cx + radius + 3))
                y2 = min(h, int(cy + radius + 3))
                patch = binary[y1:y2, x1:x2]
                if patch.size == 0:
                    continue
                edge_density = float(np.count_nonzero(patch)) / float(patch.size)
                if edge_density < 0.025:
                    continue

                # Skip if a similar circle already exists
                duplicate = False
                for s in shapes:
                    if s["type"] in ("circle", "ellipse"):
                        if _distance(s["center"], {"x": int(cx), "y": int(cy)}) < max(10, radius * 0.35):
                            duplicate = True
                            break
                if duplicate:
                    continue

                mask = np.zeros(gray.shape, np.uint8)
                cv2.circle(mask, (int(cx), int(cy)), int(radius), 255, -1)
                shapes.append({
                    "type": "circle",
                    "vertices": 0,
                    "area": area,
                    "perimeter": float(2 * np.pi * radius),
                    "circularity": 1.0,
                    "center": {"x": int(cx), "y": int(cy)},
                    "bbox": bbox,
                    "color": _color_hex_from_mask(img, mask),
                    "aspect_ratio": 1.0,
                    "confidence": _clamp01(0.62 + min(0.18, edge_density * 1.8)),
                    "solidity": 1.0,
                    "extent": 0.78,
                    "fill_ratio": 1.0,
                    "_source": "hough",
                })

        shapes = _dedupe_shapes(shapes)
        
        # Sort by area (largest first)
        shapes.sort(key=lambda s: (s.get("confidence", 0.0), s["area"]), reverse=True)
        
        return {
            "success": True,
            "shapes": shapes[:999],  # Limit to top 999 shapes
            "image_dimensions": { "width": w, "height": h },
            "total_shapes": len(shapes),
            "pipeline": {
                "min_area": float(min_area),
                "max_area": float(max_area),
                "source": "adaptive-contour-consensus+hough-v4"
            }
        }
    
    except Exception as e:
        return {
            "error": str(e),
            "shapes": [],
            "success": False
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({ "error": "No image data provided", "shapes": [] }))
        sys.exit(1)
    
    image_b64 = sys.argv[1]
    result = detect_shapes(image_b64)
    print(json.dumps(result))
