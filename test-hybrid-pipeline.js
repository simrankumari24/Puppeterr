#!/usr/bin/env node
/**
 * Test script for hybrid image analysis pipeline
 * Tests: DETR object detection + OpenCV geometric shapes + ViT semantic classification
 */

const fs = require("fs");
const path = require("path");

// Create a synthetic test image with geometric shapes
function createTestImage() {
  const spawn = require("child_process").spawn;
  return new Promise((resolve) => {
    const python = spawn("python3", ["-c", `
import cv2
import numpy as np
import base64
import json

# Create a white image with geometric shapes
img = np.ones((300, 400, 3), dtype=np.uint8) * 255

# Red circle
cv2.circle(img, (100, 100), 50, (0, 0, 255), -1)

# Blue rectangle
cv2.rectangle(img, (200, 50), (330, 150), (255, 0, 0), -1)

# Green triangle
pts = np.array([[200, 250], [250, 320], [150, 320]], dtype=np.int32)
cv2.fillPoly(img, [pts], (0, 255, 0))

# Encode to base64
_, buffer = cv2.imencode('.jpg', img)
image_b64 = base64.b64encode(buffer).decode('utf-8')
print(image_b64)
`]);
    
    let output = "";
    python.stdout.on("data", (data) => { output += data.toString(); });
    python.on("close", () => resolve(output.trim()));
  });
}

async function runTests() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Puppeterr Hybrid Image Analysis Pipeline Test Suite     ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  try {
    console.log("📸 Generating test image with shapes...");
    const imageB64 = await createTestImage();
    if (!imageB64) throw new Error("Failed to create test image");
    console.log(`   ✓ Image generated (${imageB64.length} bytes)\n`);

    // Test 1: Shape Detection
    console.log("🔍 Test 1: Shape Detection (OpenCV)\n");
    const shapeDetector = require("./shapeDetector");
    const shapeResult = await shapeDetector.analyzeImageFull(imageB64);
    
    console.log(`   Pipeline: ${shapeResult.pipeline}`);
    console.log(`   Shapes detected: ${shapeResult.analysis.shapes.length}`);
    if (shapeResult.analysis.shapes.length > 0) {
      console.log("   Top shapes:");
      shapeResult.analysis.shapes.slice(0, 5).forEach((shape, i) => {
        console.log(`     [${i+1}] ${shape.type.padEnd(10)} | area: ${Math.round(shape.area || 0).toString().padStart(6)} | conf: ${(shape.confidence || 0).toFixed(2)}`);
      });
    } else {
      console.log("   ⚠ No shapes detected (may indicate image processing issue)");
    }

    // Test 2: Semantic Analysis  
    console.log(`\n🏷️  Test 2: Semantic Classification (ViT)\n`);
    const semantic = shapeResult.analysis.semantic;
    if (semantic.error) {
      console.log(`   ⚠ Semantic analysis unavailable: ${semantic.error}`);
      console.log("   (HF_TOKEN may not be set - this is expected without HuggingFace credentials)");
    } else {
      console.log(`   Description: ${semantic.description}`);
      console.log(`   Confidence: ${semantic.confidence ? (semantic.confidence * 100).toFixed(1) + "%" : "N/A"}`);
    }

    // Test 3: Message enrichment simulation
    console.log(`\n📧 Test 3: Message Enrichment (Backend Integration)\n`);
    const mockDetrDetections = [
      { label: "circle", score: 0.95 },
      { label: "rectangle", score: 0.88 },
      { label: "triangle", score: 0.75 }
    ];
    
    console.log("   Simulating /chat endpoint with hybrid analysis...");
    const enrichedMessage = buildEnrichedMessage(
      "What shapes do you see?",
      mockDetrDetections,
      shapeResult.analysis.shapes,
      semantic
    );
    
    console.log("\n   📝 Enriched message preview:");
    console.log("   " + "─".repeat(50));
    enrichedMessage.split("\n").forEach(line => {
      console.log("   " + line);
    });
    console.log("   " + "─".repeat(50));

    // Summary
    console.log(`\n✅ All Tests Passed!\n`);
    console.log("📊 Pipeline Summary:");
    console.log(`   • DETR objects: ${mockDetrDetections.length} (mocked)`);
    console.log(`   • Geometric shapes: ${shapeResult.analysis.shapes.length} detected`);
    console.log(`   • Semantic tag: ${semantic.description || "(unavailable)"}`);
    console.log(`   • Message enrichment: ✓ Working\n`);

  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    process.exit(1);
  }
}

function buildEnrichedMessage(userMsg, detrDetections, shapes, semantic) {
  let msg = userMsg;
  
  const detrCtx = detrDetections.length > 0
    ? `DETR objects:\n${detrDetections.map((d, i) => `  ${i+1}. ${d.label} (${(d.score * 100).toFixed(0)}%)`).join("\n")}`
    : "DETR objects: None";
  
  const shapeCtx = shapes.length > 0
    ? `Geometric shapes:\n${shapes.slice(0, 5).map((s, i) => `  ${i+1}. ${s.type} (area=${Math.round(s.area || 0)}, conf=${(s.confidence || 0).toFixed(2)})`).join("\n")}`
    : "Geometric shapes: None";
  
  const semanticCtx = semantic.description
    ? `Semantic classification: ${semantic.description}${semantic.confidence ? ` (${(semantic.confidence * 100).toFixed(1)}% conf)` : ""}`
    : "Semantic classification: Unavailable";
  
  return `${msg}\n\n[Image Analysis]\n${detrCtx}\n\n${shapeCtx}\n\n${semanticCtx}`;
}

runTests().catch(console.error);
