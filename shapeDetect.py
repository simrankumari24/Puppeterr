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
from io import BytesIO

def detect_shapes(image_b64):
    """
    Detect geometric shapes in an image
    Returns list of detected shapes with properties
    """
    try:
        # Decode base64 image
        image_data = base64.b64decode(image_b64)
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return { "error": "Failed to decode image", "shapes": [] }
        
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Edge detection
        edges = cv2.Canny(blurred, 50, 150)
        
        # Dilate edges to connect nearby points
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        dilated = cv2.dilate(edges, kernel, iterations=2)
        
        # Find contours
        contours, _ = cv2.findContours(dilated, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        
        shapes = []
        h, w = img.shape[:2]
        
        for contour in contours:
            area = cv2.contourArea(contour)
            
            # Filter out very small contours (noise)
            if area < 100:
                continue
            
            # Approximate contour to a polygon
            perimeter = cv2.arcLength(contour, True)
            if perimeter == 0:
                continue
            
            approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
            x, y, rw, rh = cv2.boundingRect(approx)
            
            # Get centroid
            M = cv2.moments(contour)
            if M["m00"] > 0:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])
            else:
                cx, cy = x + rw // 2, y + rh // 2
            
            # Calculate circularity
            circularity = 4 * np.pi * area / (perimeter * perimeter) if perimeter > 0 else 0
            
            # Classify shape
            shape_type = classify_shape(approx, circularity, rw, rh)
            
            # Detect color (average color in contour region)
            mask = np.zeros(gray.shape, np.uint8)
            cv2.drawContours(mask, [contour], 0, 255, -1)
            color_pixels = img[mask == 255]
            if len(color_pixels) > 0:
                avg_color = color_pixels.mean(axis=0)
                color_hex = "#{:02x}{:02x}{:02x}".format(int(avg_color[2]), int(avg_color[1]), int(avg_color[0]))
            else:
                color_hex = "#808080"
            
            shapes.append({
                "type": shape_type,
                "vertices": len(approx),
                "area": float(area),
                "perimeter": float(perimeter),
                "circularity": float(circularity),
                "center": { "x": int(cx), "y": int(cy) },
                "bbox": { "x": int(x), "y": int(y), "width": int(rw), "height": int(rh) },
                "color": color_hex,
                "aspect_ratio": float(rw / rh) if rh > 0 else 0,
                "confidence": classify_confidence(shape_type, circularity, rw, rh)
            })
        
        # Sort by area (largest first)
        shapes.sort(key=lambda s: s["area"], reverse=True)
        
        return {
            "success": True,
            "shapes": shapes[:20],  # Limit to top 20 shapes
            "image_dimensions": { "width": w, "height": h },
            "total_shapes": len(shapes)
        }
    
    except Exception as e:
        return {
            "error": str(e),
            "shapes": [],
            "success": False
        }

def classify_shape(approx, circularity, width, height):
    """Classify a contour into a shape type"""
    vertices = len(approx)
    aspect_ratio = float(width) / height if height > 0 else 1
    
    # Circle detection
    if circularity > 0.7 and 3 <= vertices <= 8:
        return "circle"
    
    # Rectangle/Square detection
    if vertices == 4:
        # Check if it's more like a square
        if 0.8 < aspect_ratio < 1.2:
            return "square"
        else:
            return "rectangle"
    
    # Triangle detection
    if vertices == 3:
        return "triangle"
    
    # Polygon detection
    if 5 <= vertices <= 8:
        if vertices == 5:
            return "pentagon"
        elif vertices == 6:
            return "hexagon"
        elif vertices == 8:
            return "octagon"
        else:
            return f"polygon_{vertices}"
    
    # Default: generic polygon
    return f"polygon_{vertices}" if vertices > 0 else "unknown"

def classify_confidence(shape_type, circularity, width, height):
    """Estimate confidence in shape classification (0-1)"""
    aspect_ratio = float(width) / height if height > 0 else 1
    
    if shape_type == "circle":
        # Circle confidence based on circularity
        return min(1.0, circularity * 1.3)
    
    if shape_type in ("rectangle", "square"):
        # Rectangle confidence based on aspect ratio regularity
        if shape_type == "square":
            return min(1.0, 1.0 / (abs(1.0 - aspect_ratio) + 0.2))
        else:
            return min(1.0, max(0.5, 1.0 - abs(aspect_ratio - 2.0) * 0.2))
    
    if shape_type == "triangle":
        return 0.7
    
    # Default confidence for polygons
    return 0.5 + (circularity * 0.3)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({ "error": "No image data provided", "shapes": [] }))
        sys.exit(1)
    
    image_b64 = sys.argv[1]
    result = detect_shapes(image_b64)
    print(json.dumps(result))
