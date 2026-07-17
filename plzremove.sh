#!/bin/bash
set +e

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

if [[ -z "$CF_API_TOKEN" || -z "$CF_ACCOUNT_ID" ]]; then
  echo "Missing CF_API_TOKEN or CF_ACCOUNT_ID in .env"
  exit 1
fi

PROMPT=${PROMPT:-"a blue ceramic vase on a wooden table, studio lighting"}
MODEL_FILE=${MODEL_FILE:-"flux_models.txt"}

# Catalog listing is often blocked on this account even when inference works,
# so keep a small fallback list of likely Workers AI Flux model ids.
KNOWN_FLUX_MODELS=(
  "@cf/black-forest-labs/flux-1-schnell"
  "@cf/black-forest-labs/flux-1-dev"
)

declare -A TIMES
declare -A STATUSES
declare -A SUCCESS_FLAGS
declare -A REACHABLE_FLAGS

echo "=== Fetching Cloudflare AI Models ==="
MODEL_JSON=$(curl -s \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/ai/models")

CATALOG_SUCCESS=$(echo "$MODEL_JSON" | jq -r '.success // false' 2>/dev/null)

if [[ "$CATALOG_SUCCESS" == "true" ]]; then
  echo "$MODEL_JSON" | jq -r '.result[]?.id' | grep 'flux' | sort -u > "$MODEL_FILE"
else
  echo "Catalog unavailable; falling back to known Flux candidates."
  echo "Catalog response: $(echo "$MODEL_JSON" | jq -c '.' 2>/dev/null || echo "$MODEL_JSON")"
  printf '%s\n' "${KNOWN_FLUX_MODELS[@]}" > "$MODEL_FILE"
fi

echo "=== Flux Models To Test ==="
cat "$MODEL_FILE"
echo

echo "=== Running Flux Leaderboard ==="
echo "Prompt: $PROMPT"
echo

while IFS= read -r MODEL; do
  [[ -z "$MODEL" ]] && continue
  echo "Running $MODEL..."

  START=$(date +%s%3N)

  RAW_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/ai/run/$MODEL" \
    --data "{\"prompt\":\"$PROMPT\"}")

  END=$(date +%s%3N)
  ELAPSED=$((END - START))

  HTTP_STATUS=$(echo "$RAW_RESPONSE" | sed -n 's/^HTTP_STATUS://p' | tail -n 1)
  RESPONSE=$(echo "$RAW_RESPONSE" | sed '/^HTTP_STATUS:/d')
  SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false' 2>/dev/null)
  ERROR_SUMMARY=$(echo "$RESPONSE" | jq -c '.errors // []' 2>/dev/null)
  ERROR_CODES=$(echo "$RESPONSE" | jq -r '[.errors[]?.code] | join(",")' 2>/dev/null)

  REACHABLE=false
  if [[ "$SUCCESS" == "true" ]]; then
    REACHABLE=true
  elif [[ "$ERROR_CODES" == *"3030"* ]]; then
    REACHABLE=true
  fi

  TIMES[$MODEL]=$ELAPSED
  STATUSES[$MODEL]=$HTTP_STATUS
  SUCCESS_FLAGS[$MODEL]=$SUCCESS
  REACHABLE_FLAGS[$MODEL]=$REACHABLE

  echo "HTTP: ${HTTP_STATUS:-unknown}"
  echo "Time: ${ELAPSED}ms"
  echo "Success: ${SUCCESS:-false}"
  echo "Reachable: ${REACHABLE}"
  if [[ "$SUCCESS" != "true" ]]; then
    echo "Errors: ${ERROR_SUMMARY:-unknown}"
  fi
  echo
done < "$MODEL_FILE"

echo "=== Leaderboard (Fastest First) ==="
for MODEL in "${!TIMES[@]}"; do
  echo "${TIMES[$MODEL]}ms | HTTP ${STATUSES[$MODEL]:-?} | reachable=${REACHABLE_FLAGS[$MODEL]:-false} | success=${SUCCESS_FLAGS[$MODEL]:-false} | $MODEL"
done | sort -n
