/**
 * Hybrid Shape Detector
 * Combines contour analysis + ViT semantic understanding
 */

const { HfInference } = require("@huggingface/inference");
const { spawn } = require("child_process");

// Initialize HF client (uses HF_TOKEN env var)
const hf = new HfInference(process.env.HF_TOKEN);

/**
 * Analyze image for shapes and semantic content
 * @param {string} imageB64 - Base64-encoded image data
 * @returns {Object} - { shapes, semantic, confidence }
 */
async function analyzeImageHybrid(imageB64) {
  try {
    // Run OpenCV detection and ViT semantic analysis in parallel
    const [shapes, semantic] = await Promise.all([
      detectShapesWithOpenCV(imageB64),
      getSemanticUnderstanding(imageB64)
    ]);

    return {
      shapes,
      semantic,
      confidence: {
        shapes: shapes.length > 0 ? Math.min(1, 0.6 + shapes[0].confidence * 0.4) : 0,
        semantic: semantic.confidence || 0
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Shape detection error:", error.message);
    return {
      shapes: [],
      semantic: { error: error.message },
      confidence: { shapes: 0, semantic: 0 }
    };
  }
}

/**
 * Get semantic understanding using ViT image classification
 */
async function getSemanticUnderstanding(imageB64) {
  try {
    // Convert to Buffer for HF API
    const imageBuffer = Buffer.from(imageB64, "base64");

    // Use HF image classification with ViT
    const result = await hf.imageClassification({
      data: imageBuffer,
      model: "google/vit-base-patch16-224-in21k",
      top_k: 5
    });

    if (!Array.isArray(result) || result.length === 0) {
      return { description: "Unknown content", confidence: 0 };
    }

    return {
      description: result[0].label,
      confidence: result[0].score,
      alternatives: result.slice(1, 3).map(r => ({ label: r.label, score: r.score })),
      allScores: result
    };
  } catch (error) {
    console.error("ViT classification error:", error.message);
    return {
      description: "Classification unavailable",
      confidence: 0,
      error: error.message
    };
  }
}

/**
 * Call OpenCV via Python subprocess for shape detection
 */
async function detectShapesWithOpenCV(imageB64) {
  return new Promise((resolve) => {
    try {
      const python = spawn("python3", [__dirname + "/shapeDetect.py", imageB64]);
      let output = "";
      let errorOutput = "";

      python.stdout.on("data", (data) => {
        output += data.toString();
      });

      python.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      python.on("close", (code) => {
        try {
          if (code !== 0 && errorOutput) {
            console.error("Shape detection stderr:", errorOutput);
            resolve([]);
            return;
          }

          const result = JSON.parse(output);
          if (result.success && Array.isArray(result.shapes)) {
            resolve(result.shapes);
          } else {
            resolve([]);
          }
        } catch (parseErr) {
          console.error("Failed to parse shape detection output:", parseErr.message);
          resolve([]);
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        python.kill();
        resolve([]);
      }, 10000);
    } catch (error) {
      console.error("Shape detection subprocess error:", error.message);
      resolve([]);
    }
  });
}

/**
 * Hybrid analysis: combine DETR + OpenCV shapes + ViT semantic
 */
async function analyzeImageFull(imageB64) {
  const hybrid = await analyzeImageHybrid(imageB64);
  return {
    pipeline: "hybrid",
    analysis: hybrid,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  analyzeImageHybrid,
  analyzeImageFull,
  getSemanticUnderstanding,
  detectShapesWithOpenCV
};
