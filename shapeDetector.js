const { chromium } = require("playwright");
const pixelGridReasoner = require("./pixelGridReasoner");

let sharedBrowser = null;
let sharedContext = null;
let sharedPage = null;

async function getSharedPage(columns, rows) {
  if (!sharedBrowser) {
    sharedBrowser = await chromium.launch({ headless: true });
  }
  if (!sharedContext) {
    sharedContext = await sharedBrowser.newContext();
  }
  if (!sharedPage) {
    sharedPage = await sharedContext.newPage({ viewport: { width: columns, height: rows } });
  }
  await sharedPage.setViewportSize({ width: columns, height: rows }).catch(() => {});
  return sharedPage;
}

async function closeSharedResources() {
  if (sharedPage) {
    await sharedPage.close().catch(() => {});
    sharedPage = null;
  }
  if (sharedContext) {
    await sharedContext.close().catch(() => {});
    sharedContext = null;
  }
  if (sharedBrowser) {
    await sharedBrowser.close().catch(() => {});
    sharedBrowser = null;
  }
}

process.once("exit", () => {
  if (sharedPage) {
    try { sharedPage.close(); } catch {}
  }
  if (sharedContext) {
    try { sharedContext.close(); } catch {}
  }
  if (sharedBrowser) {
    try { sharedBrowser.close(); } catch {}
  }
});

function inferMimeFromBase64(imageB64) {
  const buffer = Buffer.from(String(imageB64 || "").slice(0, 128), "base64");
  const text = buffer.toString("utf8", 0, Math.min(buffer.length, 64)).trim().toLowerCase();
  if (text.startsWith("<svg") || text.startsWith("<?xml")) return "image/svg+xml";
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 3 && buffer.toString("ascii", 0, 3) === "GIF") return "image/gif";
  return "image/png";
}

async function extractPixelGridFromImage(imageB64, columns = 128, rows = 64) {
  const mimeType = inferMimeFromBase64(imageB64);
  const dataUrl = `data:${mimeType};base64,${String(imageB64 || "").replace(/\s+/g, "")}`;
  try {
    const page = await getSharedPage(columns, rows);
    const grid = await page.evaluate(async ({ dataUrlValue, columnsValue, rowsValue }) => {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = dataUrlValue;
      });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Number(columnsValue) || 1);
      canvas.height = Math.max(1, Number(rowsValue) || 1);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const luminances = [];

      for (let row = 0; row < canvas.height; row += 1) {
        for (let column = 0; column < canvas.width; column += 1) {
          const index = ((row * canvas.width) + column) * 4;
          const red = imageData[index] || 0;
          const green = imageData[index + 1] || 0;
          const blue = imageData[index + 2] || 0;
          const alpha = imageData[index + 3] || 0;
          const luminance = ((0.299 * red) + (0.587 * green) + (0.114 * blue)) * (alpha / 255);
          luminances.push(luminance);
        }
      }

      const sorted = [...luminances].sort((a, b) => a - b);
      const threshold = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 128;
      const rowsOut = [];

      for (let row = 0; row < canvas.height; row += 1) {
        let line = "";
        for (let column = 0; column < canvas.width; column += 1) {
          const index = ((row * canvas.width) + column) * 4;
          const red = imageData[index] || 0;
          const green = imageData[index + 1] || 0;
          const blue = imageData[index + 2] || 0;
          const alpha = imageData[index + 3] || 0;
          const luminance = ((0.299 * red) + (0.587 * green) + (0.114 * blue)) * (alpha / 255);
          line += luminance >= threshold ? "R" : "G";
        }
        rowsOut.push(line);
      }

      return rowsOut;
    }, { dataUrlValue: dataUrl, columnsValue: columns, rowsValue: rows });
    return Array.isArray(grid) ? grid : [];
  } catch (error) {
    console.error("Pixel grid extractor error:", error.message);
    await closeSharedResources();
    return [];
  }
}

async function analyzeImageHybrid(imageB64) {
  const grid = await extractPixelGridFromImage(imageB64);
  const parsed = pixelGridReasoner.parsePixelGrid(grid);
  return {
    grid,
    ...parsed,
    shapes: parsed.glyphs,
    semantic: {
      description: "pixel_grid_reasoning",
      confidence: 1,
      source: "deterministic"
    },
    confidence: {
      shapes: parsed.glyphs.length > 0 ? 1 : 0,
      semantic: 0
    },
    timestamp: new Date().toISOString()
  };
}

async function analyzeImageFull(imageB64) {
  const analysis = await analyzeImageHybrid(imageB64);
  return {
    pipeline: "pixel-grid",
    analysis,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  analyzeImageHybrid,
  analyzeImageFull,
  extractPixelGridFromImage,
  getSemanticUnderstanding: async () => ({ description: "pixel_grid_reasoning", confidence: 1, source: "deterministic" }),
  detectShapesWithOpenCV: async () => []
};
