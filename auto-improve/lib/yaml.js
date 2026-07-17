function parseScalar(raw) {
  const value = String(raw || "").trim();
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseYaml(yamlText) {
  const lines = String(yamlText || "").replace(/\t/g, "  ").split(/\r?\n/);
  const root = {};
  const stack = [{ indent: -1, node: root }];

  for (const line of lines) {
    if (!line || /^\s*#/.test(line)) continue;
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    const trimmed = line.trim();
    if (trimmed === "") continue;

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].node;

    if (trimmed.startsWith("- ")) {
      throw new Error("Top-level YAML arrays are not supported in this config parser.");
    }

    const keyValue = trimmed.match(/^([^:]+):(.*)$/);
    if (!keyValue) continue;

    const key = keyValue[1].trim();
    const remainder = keyValue[2];

    if (remainder.trim() === "") {
      parent[key] = {};
      stack.push({ indent, node: parent[key] });
    } else {
      parent[key] = parseScalar(remainder);
    }
  }

  return root;
}

function toYaml(value, depth = 0) {
  const indent = "  ".repeat(depth);
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (value === "" || /[:#\n]/.test(value)) return JSON.stringify(value);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => `${indent}- ${toYaml(item, depth + 1).trimStart()}`).join("\n");
  }

  const lines = [];
  for (const [k, v] of Object.entries(value)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      lines.push(`${indent}${k}:`);
      lines.push(toYaml(v, depth + 1));
    } else {
      lines.push(`${indent}${k}: ${toYaml(v, depth + 1).trimStart()}`);
    }
  }
  return lines.join("\n");
}

module.exports = {
  parseYaml,
  toYaml
};
