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


def _dedupe_shapes(shapes):
    if not shapes:
        return []

    kept = []
    for shape in sorted(shapes, key=lambda s: (s.get("confidence", 0.0), s.get("area", 0.0)), reverse=True):
        is_duplicate = False
        for existing in kept:
            iou = _bbox_iou(shape["bbox"], existing["bbox"])
            near_center = _distance(shape["center"], existing["center"]) < 8
            same_type = shape["type"] == existing["type"]
            if (same_type and iou > 0.55) or (near_center and iou > 0.35):
                is_duplicate = True
                break
        if not is_duplicate:
            kept.append(shape)

    return kept


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

    combined = cv2.bitwise_or(edges, cv2.bitwise_xor(thresh_otsu, thresh_adapt))
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, k, iterations=2)
    combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, k, iterations=1)
    return smoothed, combined


def _classify_shape(features):
    vertices = features["vertices"]
    circularity = features["circularity"]
    aspect_ratio = features["aspect_ratio"]
    extent = features["extent"]
    solidity = features["solidity"]
    fill_ratio = features["fill_ratio"]
    ellipse_axis_ratio = features["ellipse_axis_ratio"]

    # Circle/Ellipse
    if circularity > 0.78 and fill_ratio > 0.7:
        if ellipse_axis_ratio is not None and ellipse_axis_ratio < 0.82:
            return "ellipse", _clamp01(0.62 + 0.28 * circularity + 0.1 * solidity)
        return "circle", _clamp01(0.7 + 0.22 * circularity + 0.08 * solidity)

    # Triangle
    if vertices == 3:
        tri_conf = 0.58 + 0.25 * solidity + 0.17 * extent
        return "triangle", _clamp01(tri_conf)

    # Quadrilateral
    if vertices == 4:
        rectangularity = _clamp01(extent * solidity)
        if 0.86 <= aspect_ratio <= 1.16:
            sq_conf = 0.52 + 0.33 * rectangularity + 0.15 * (1.0 - abs(1.0 - aspect_ratio))
            return "square", _clamp01(sq_conf)
        rect_conf = 0.5 + 0.35 * rectangularity + 0.15 * _clamp01(1.0 - abs(1.9 - aspect_ratio) / 3.5)
        return "rectangle", _clamp01(rect_conf)

    # Known polygons
    if vertices == 5:
        return "pentagon", _clamp01(0.48 + 0.32 * solidity + 0.2 * extent)
    if vertices == 6:
        return "hexagon", _clamp01(0.48 + 0.3 * solidity + 0.22 * extent)
    if vertices == 8:
        return "octagon", _clamp01(0.47 + 0.3 * solidity + 0.23 * extent)

    # Generic polygon fallback
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

        # Find contours on cleaned binary edge map
        contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        
        shapes = []
        h, w = img.shape[:2]
        image_area = float(max(1, h * w))
        min_area = max(80.0, image_area * 0.00008)
        max_area = image_area * 0.97
        
        for contour in contours:
            area = float(cv2.contourArea(contour))
            
            # Filter out very small/very large contours (noise/background)
            if area < min_area or area > max_area:
                continue
            
            # Approximate contour to a polygon
            perimeter = float(cv2.arcLength(contour, True))
            if perimeter == 0:
                continue
            
            epsilon = 0.012 * perimeter
            approx = cv2.approxPolyDP(contour, epsilon, True)

            if len(approx) < 3:
                continue

            f = _shape_features(contour, approx)
            shape_type, confidence = _classify_shape(f)

            # Reject unstable contours
            if f["solidity"] < 0.35 and f["extent"] < 0.22:
                continue
            if confidence < 0.42:
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
                "fill_ratio": f["fill_ratio"]
            })

        # Hough circle fallback for low-contrast circular objects
        circle_candidates = cv2.HoughCircles(
            smooth,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=max(16, int(min(h, w) * 0.04)),
            param1=120,
            param2=24,
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
                    "confidence": 0.66,
                    "solidity": 1.0,
                    "extent": 0.78,
                    "fill_ratio": 1.0,
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
                "source": "adaptive-contour+hough-v2"
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
