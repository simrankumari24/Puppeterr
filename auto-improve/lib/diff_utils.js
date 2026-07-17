function countDiffChangedLines(diffText) {
  return String(diffText || "")
    .split(/\r?\n/)
    .filter(line => (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---"))
    .length;
}

function listTouchedFiles(diffText) {
  const files = [];
  for (const line of String(diffText || "").split(/\r?\n/)) {
    if (!line.startsWith("diff --git ")) continue;
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (!m) continue;
    files.push(m[2]);
  }
  return Array.from(new Set(files));
}

function hasDependencyChanges(diffText) {
  const files = listTouchedFiles(diffText);
  return files.some(file => /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|poetry\.lock|Pipfile(\.lock)?)$/i.test(file));
}

function hasLicenseChanges(diffText) {
  const files = listTouchedFiles(diffText);
  return files.some(file => /(^|\/)(license|license\.md|license\.txt|void_license\.txt)$/i.test(file));
}

function hasPotentialEnvBreakingChanges(diffText) {
  const files = listTouchedFiles(diffText);
  return files.some(file => /(^|\/)(dockerfile|\.devcontainer\/|wrangler\.(toml|jsonc)|jenkinsfile|\.github\/workflows\/)/i.test(file));
}

module.exports = {
  countDiffChangedLines,
  listTouchedFiles,
  hasDependencyChanges,
  hasLicenseChanges,
  hasPotentialEnvBreakingChanges
};
