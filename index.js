const puppeteer = require('puppeteer');

const DEFAULT_URL = 'https://example.com';

function normalizeText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function splitSentences(text) {
  return text
    .match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)
    ?.map(sentence => sentence.trim())
    .filter(Boolean) || [];
}

function getChromeExecutablePath() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_EXECUTABLE || process.env.CHROME_BIN;
  if (envPath) return envPath;

  const candidates = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser'];
  const { execSync } = require('child_process');

  for (const name of candidates) {
    try {
      const path = execSync(`command -v ${name}`, { encoding: 'utf8' }).trim();
      if (path) return path;
    } catch (error) {
      // ignore missing command
    }
  }

  return null;
}

function summarizeText(text, maxSentences = 3) {
  const cleaned = normalizeText(text);
  if (!cleaned) return 'No text found to summarize.';

  const sentences = splitSentences(cleaned);
  if (sentences.length <= maxSentences) return cleaned;

  const stopwords = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'has', 'was', 'were', 'are', 'not', 'but', 'you', 'your', 'they', 'their', 'will', 'can', 'would', 'should', 'there', 'what', 'when', 'which', 'where', 'how', 'all', 'any', 'one', 'about', 'been', 'also', 'more', 'its', 'into', 'than', 'them', 'these', 'those', 'such', 'most'
  ]);

  const words = cleaned
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(word => !stopwords.has(word));

  const frequency = words.reduce((map, word) => {
    map[word] = (map[word] || 0) + 1;
    return map;
  }, {});

  const scores = sentences.map(sentence => {
    const score = sentence
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .reduce((sum, word) => sum + (frequency[word] || 0), 0);
    return { sentence, score };
  });

  const topSentences = scores
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .map(item => item.sentence);

  const orderedSummary = sentences.filter(sentence => topSentences.includes(sentence));
  return orderedSummary.join(' ');
}

async function fetchPageText(url) {
  const executablePath = getChromeExecutablePath();
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const text = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parentTag = node.parentElement?.tagName;
          const textContent = node.nodeValue?.trim();
          if (!textContent) return NodeFilter.FILTER_REJECT;
          if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'NAV', 'FORM'].includes(parentTag)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      let content = '';
      while (walker.nextNode()) {
        content += `${walker.currentNode.nodeValue.trim()} `;
      }
      return content.replace(/\s+/g, ' ').trim();
    });

    return normalizeText(text);
  } finally {
    await browser.close();
  }
}

class PuppetAI {
  async fetchAndSummarize(url = DEFAULT_URL, maxSentences = 3) {
    const pageText = await fetchPageText(url);
    const summary = summarizeText(pageText, maxSentences);

    return {
      url,
      summary,
      rawText: pageText,
      summaryNotes: 'This is a lightweight built-in summary. Swap in an NLP model for richer AI behavior.',
    };
  }

  async performTask(task, url = DEFAULT_URL) {
    if (task === 'summarize') {
      return this.fetchAndSummarize(url);
    }

    if (task === 'fetch') {
      const rawText = await fetchPageText(url);
      return { url, rawText };
    }

    return {
      url,
      task,
      message: 'Task not recognized. Available tasks: summarize, fetch.',
    };
  }
}

async function main() {
  const [, , taskArg, urlArg] = process.argv;
  const task = taskArg || 'summarize';
  const url = urlArg || DEFAULT_URL;

  const ai = new PuppetAI();
  const result = await ai.performTask(task, url);

  console.log('=== PuppetAI Report ===');
  console.log(`URL: ${result.url}`);
  console.log(`Task: ${task}`);

  if (result.summary) {
    console.log('\n--- Summary ---\n');
    console.log(result.summary);
  }

  if (result.rawText && task !== 'fetch') {
    console.log('\n--- Raw Text Snippet ---\n');
    console.log(result.rawText.slice(0, 800) + (result.rawText.length > 800 ? '...' : ''));
  }

  if (result.message) {
    console.log('\n' + result.message);
  }
}

main().catch(error => {
  console.error('PuppetAI failed:', error.message || error);
  process.exit(1);
});
