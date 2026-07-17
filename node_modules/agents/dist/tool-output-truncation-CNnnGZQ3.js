//#region src/chat/tool-output-truncation.ts
const DEFAULT_MAX_DEPTH = 8;
const TRUNCATED_FLAG = "__truncated";
const TRUNCATED_CHARS = "__truncatedChars";
function truncateToolOutput(output, maxChars) {
	const original = stringifyForLength(output);
	if (original.length <= maxChars) return {
		output,
		truncated: false,
		originalLength: original.length
	};
	return {
		output: truncateValue(output, maxChars, original.length, 0),
		truncated: true,
		originalLength: original.length
	};
}
function truncatedSuffix(originalLength) {
	return `... [truncated ${originalLength} chars]`;
}
function truncateValue(value, maxChars, originalLength, depth) {
	if (typeof value === "string") return truncateString(value, maxChars, value.length);
	if (value === null || typeof value !== "object") return value;
	if (depth >= DEFAULT_MAX_DEPTH) return `[Nested output omitted ${truncatedSuffix(originalLength)}]`;
	if (Array.isArray(value)) return truncateArray(value, maxChars, originalLength, depth);
	return truncateObject(value, maxChars, originalLength, depth);
}
function truncateArray(value, maxChars, originalLength, depth) {
	const childBudget = childMaxChars(maxChars, value.length);
	const result = value.map((item) => truncateValue(item, childBudget, stringifyForLength(item).length, depth + 1));
	while (result.length > 1 && stringifyForLength(result).length > maxChars) result.pop();
	if (result.length < value.length) result.push(`Array output truncated ${truncatedSuffix(originalLength)}`);
	if (stringifyForLength(result).length > maxChars) return compactArrayMarker(maxChars, originalLength);
	return result;
}
function truncateObject(value, maxChars, originalLength, depth) {
	const entries = Object.entries(value);
	const childBudget = childMaxChars(maxChars, entries.length);
	const result = {};
	for (const [key, entryValue] of entries) result[key] = truncateValue(entryValue, childBudget, stringifyForLength(entryValue).length, depth + 1);
	const resultLength = stringifyForLength(result).length;
	if (resultLength <= maxChars) return result;
	shrinkStringFields(result, maxChars);
	if (stringifyForLength(result).length > maxChars) {
		result[TRUNCATED_FLAG] = true;
		result[TRUNCATED_CHARS] = resultLength;
	}
	if (stringifyForLength(result).length > maxChars) return compactObjectMarker(maxChars, originalLength);
	return result;
}
function shrinkStringFields(value, maxChars) {
	const stringEntries = Object.entries(value).filter((entry) => typeof entry[1] === "string").sort((a, b) => b[1].length - a[1].length);
	for (const [key, str] of stringEntries) {
		if (stringifyForLength(value).length <= maxChars) return;
		value[key] = truncateString(str, Math.max(0, Math.floor(maxChars / 4)), str.length);
	}
}
function truncateString(value, maxChars, originalLength) {
	if (value.length <= maxChars) return value;
	const suffix = truncatedSuffix(originalLength);
	if (maxChars <= suffix.length) return suffix.slice(0, maxChars);
	return `${value.slice(0, maxChars - suffix.length)}${suffix}`;
}
function compactObjectMarker(maxChars, originalLength) {
	const marker = {
		[TRUNCATED_FLAG]: true,
		[TRUNCATED_CHARS]: originalLength,
		note: "Tool output omitted because it was too large to preserve structurally."
	};
	if (stringifyForLength(marker).length <= maxChars) return marker;
	return {
		[TRUNCATED_FLAG]: true,
		[TRUNCATED_CHARS]: originalLength
	};
}
function compactArrayMarker(maxChars, originalLength) {
	const structuredMarker = compactObjectMarker(maxChars, originalLength);
	if (stringifyForLength([structuredMarker]).length <= maxChars) return [structuredMarker];
	const marker = [`Array output omitted because it was too large to preserve structurally ${truncatedSuffix(originalLength)}`];
	if (stringifyForLength(marker).length <= maxChars) return marker;
	return [truncatedSuffix(originalLength).slice(0, maxChars)];
}
function childMaxChars(maxChars, childCount) {
	if (childCount <= 1) return maxChars;
	return Math.max(80, Math.floor(maxChars / Math.min(childCount, 10)));
}
function stringifyForLength(value) {
	try {
		if (typeof value === "string") return value;
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}
//#endregion
export { truncateToolOutput as t };

//# sourceMappingURL=tool-output-truncation-CNnnGZQ3.js.map