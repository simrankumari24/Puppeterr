# Puppeterr
An AI that uses Puppeteer to browse pages, fetch text, and generate simple summaries.

## Usage

Install dependencies:

```bash
npm install
```

Run the default summary task on `https://example.com`:

```bash
npm start
```

Run an explicit summary task:

```bash
npm run summarize
```

Fetch raw page text without summarizing:

```bash
npm run fetch
```

Run against a different URL:

```bash
node index.js summarize https://example.com
```

## Notes

- The script uses Puppeteer to load web pages in headless Chrome.
- It extracts visible text content and generates a lightweight summary.
- The AI structure is designed to be extended with additional tasks and richer NLP/ML capabilities.
