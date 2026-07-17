# Using Cloudflare AI with Auto-Improve

The auto-improve system is preconfigured to use **Cloudflare AI** as its default provider. This means it leverages your existing Cloudflare Workers AI credentials to generate and review patches automatically.

## Setup (Just 2 Environment Variables)

Ensure these are set in your environment:

```bash
export CF_ACCOUNT_ID="your-cloudflare-account-id"
export CF_API_TOKEN="your-cloudflare-api-token"
```

That's it. The auto-improve system will:
- Use `@cf/moonshotai/kimi-k2.7-code` for code generation (can be overridden in config)
- Call the Cloudflare API at `https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/{model}`
- Generate patches locally using your Cloudflare credits
- No external AI service subscriptions needed

## Verify It Works

```bash
npm run auto:test
```

Watch for output like:
```
✓ fix_orchestrator completed
Patch proposals generated: 5
```

If credentials are missing or invalid, the system gracefully falls back to mock mode:
```json
{
  "title": "Cloudflare not configured",
  "rationale": "Missing CF_ACCOUNT_ID or CF_API_TOKEN...",
  "risk": "high",
  "diff": ""
}
```

## Supported Cloudflare Models

Recommended models for code generation:

| Model ID | Task | Notes |
|----------|------|-------|
| `@cf/moonshotai/kimi-k2.7-code` | Code generation | **Recommended** — best for patches |
| `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` | Reasoning | Good for analysis |
| `@cf/meta/llama-3.2-11b-vision-instruct` | Vision | For screenshot/image context |
| `@cf/anthropic/claude-sonnet-4.6` | General | Solid alternative |

### How to Change the Model

Edit `auto-improve/config.yaml`:

```yaml
ai_provider: cloudflare
ai_model: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b"
```

Or temporarily override at runtime:

```bash
node -e "
const { loadConfig, saveConfig } = require('./auto-improve/lib/config');
const { config, configPath } = loadConfig();
config.ai_model = '@cf/anthropic/claude-sonnet-4.6';
saveConfig(config, configPath);
"

npm run auto:test
```

## How It Works Under the Hood

1. **Patch Generation** (`fix_orchestrator.js`)
   - Sends 5 coder prompts to Cloudflare in parallel
   - Each request is a simple POST to `https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/{model}`
   - Cloudflare returns text response
   - Parses response as JSON with `{title, rationale, risk, diff, test_plan}`

2. **Patch Review** (`review_orchestrator.js`)
   - Sends 2 reviewer prompts per patch (10 total reviews)
   - Same Cloudflare endpoint
   - Reviewers score 0-1000 based on correctness and safety

3. **Approval** (`auto_approval_engine.js`)
   - Applies policy gates locally (no API calls)
   - Scores must be ≥ 800, diffs < 150 lines, etc.

4. **Git Apply** (`git_patch_applier.js`)
   - Applies approved patches to git locally
   - No API calls needed

## Cost and Rate Limits

Cloudflare AI pricing depends on your plan. See https://developers.cloudflare.com/workers-ai/pricing/

- Each `npm run auto:test` costs ~7 API calls (5 coders + 2 sample reviewers in fallback mode)
- Each real `npm run auto:run` costs the same
- Typical cost: negligible on most plans

**Rate Limits**: Cloudflare has per-minute and per-account limits. If you hit them, the system gracefully falls back to mock mode and continues.

## Troubleshooting

### Error: "Cloudflare not configured"

```json
{
  "title": "Cloudflare not configured",
  "rationale": "Missing CF_ACCOUNT_ID or CF_API_TOKEN environment variables..."
}
```

**Solution**: Set both env vars:
```bash
export CF_ACCOUNT_ID="your-account-id"
export CF_API_TOKEN="your-token"
npm run auto:test
```

### Error: "Cloudflare API error: 403"

Possible causes:
- Invalid token
- Token doesn't have AI permission
- Account ID is wrong

**Solution**: Verify credentials:
```bash
curl -X GET "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/models" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json"
```

Should return a list of available models. If not, check your credentials.

### Error: "Cloudflare call failed"

Possible causes:
- Rate limited
- API temporarily down
- Network error

**Solution**: The system automatically falls back to mock mode and logs the error. Check:
```bash
cat auto-improve/reports/patch_metadata_A.json | jq '.provider, .model, .rationale'
```

### Getting Empty Patch Diffs

Cloudflare's code models may not always generate valid diffs in mock/fallback mode. This is expected. To get real diffs:

1. Ensure credentials are valid
2. Check provider is `cloudflare`: `cat auto-improve/config.yaml | grep ai_provider`
3. Run: `npm run auto:test`
4. Inspect: `cat auto-improve/reports/patch_proposal_A.diff`

If still empty, the model may be returning natural language instead of JSON. Try a different model:

```bash
node -e "
const { loadConfig, saveConfig } = require('./auto-improve/lib/config');
const { config, configPath } = loadConfig();
config.ai_model = '@cf/anthropic/claude-sonnet-4.6';
saveConfig(config, configPath);
"

npm run auto:test
```

## Switching Providers

If you want to use a different AI backend:

### Use OpenAI Instead

```bash
export AI_ENDPOINT="https://api.openai.com/v1/chat/completions"
export AI_API_KEY="sk-..."
export AI_MODEL="gpt-4o-mini"

node -e "
const { loadConfig, saveConfig } = require('./auto-improve/lib/config');
const { config, configPath } = loadConfig();
config.ai_provider = 'openai_compatible';
config.ai_model = 'gpt-4o-mini';
saveConfig(config, configPath);
"

npm run auto:test
```

### Use Mock Mode (No Calls, Deterministic)

```bash
node -e "
const { loadConfig, saveConfig } = require('./auto-improve/lib/config');
const { config, configPath } = loadConfig();
config.ai_provider = 'mock';
saveConfig(config, configPath);
"

npm run auto:test
```

### Back to Cloudflare

```bash
node -e "
const { loadConfig, saveConfig } = require('./auto-improve/lib/config');
const { config, configPath } = loadConfig();
config.ai_provider = 'cloudflare';
config.ai_model = '@cf/moonshotai/kimi-k2.7-code';
saveConfig(config, configPath);
"

npm run auto:test
```

## Best Practices

1. **Use Cloudflare for Development**: Free/cheap, no subscriptions needed
2. **Use OpenAI for Higher Quality**: If cost isn't a concern and you need GPT-4
3. **Use Mock Mode for Testing**: When you're debugging the pipeline itself
4. **Set Stricter Approval Thresholds in CI**: Increase `min_score_for_auto_approval` to 900+
5. **Always Keep Auto Mode OFF in CI**: Let human reviewers approve before git push

## Next Steps

1. **Test it now**:
   ```bash
   npm run auto:test
   ```

2. **Inspect a patch**:
   ```bash
   npm run auto:cli -- pending
   npm run auto:cli -- show A
   cat auto-improve/reports/patch_proposal_A.diff
   ```

3. **Run with real agent**:
   ```bash
   npm run auto:run
   ```

4. **Monitor performance**:
   ```bash
   jq '.results[] | {patch_id, provider, model}' auto-improve/reports/review_batch.json
   ```

