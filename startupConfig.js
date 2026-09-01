function cloudflareModeFromEnv(env = process.env) {
  const token = String(env?.CF_API_TOKEN || "").trim();
  const accountId = String(env?.CF_ACCOUNT_ID || "").trim();
  const hasConfig = !!(token && accountId);
  const requireConfig = ["1", "true", "yes", "on"].includes(String(env?.PUPPETERR_REQUIRE_CF || "").trim().toLowerCase());
  const disabled = ["1", "true", "yes", "on"].includes(String(env?.PUPPETERR_DISABLE_CLOUDFLARE || "").trim().toLowerCase());

  return {
    token,
    accountId,
    hasConfig,
    requireConfig,
    disabled,
    degradedMode: !hasConfig && !requireConfig && !disabled,
    shouldExit: !hasConfig && requireConfig
  };
}

module.exports = {
  cloudflareModeFromEnv
};
