//#region src/utils.ts
/**
* Property keys that JavaScript runtimes and test frameworks probe
* on arbitrary objects (serialization, thenable check, inspection,
* matcher duck-typing). When an RPC-stub Proxy is accessed by
* `JSON.stringify`, `console.log`, `await`, Vitest matchers, etc.,
* it hits one of these — we must return `undefined` instead of a
* call-wrapper to avoid firing a bogus RPC for a method the child
* doesn't implement.
*
* @internal
*/
const INTERNAL_JS_STUB_PROPS = /* @__PURE__ */ new Set([
	"toJSON",
	"then",
	"catch",
	"finally",
	"valueOf",
	"toString",
	"constructor",
	"prototype",
	"$$typeof",
	"@@toStringTag",
	"asymmetricMatch",
	"nodeType"
]);
/**
* True when the property access is a JS-internal probe that must
* NOT dispatch an RPC call. Catches all symbol keys plus the named
* set above.
*
* @internal
*/
function isInternalJsStubProp(prop) {
	return typeof prop === "symbol" || INTERNAL_JS_STUB_PROPS.has(prop);
}
/**
* Convert a camelCase string to a kebab-case string
* @param str The string to convert
* @returns The kebab-case string
*/
function camelCaseToKebabCase(str) {
	if (str === str.toUpperCase() && str !== str.toLowerCase()) return str.toLowerCase().replace(/_/g, "-");
	let kebabified = str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
	kebabified = kebabified.startsWith("-") ? kebabified.slice(1) : kebabified;
	return kebabified.replace(/_/g, "-").replace(/-$/, "");
}
//#endregion
export { INTERNAL_JS_STUB_PROPS, camelCaseToKebabCase, isInternalJsStubProp };

//# sourceMappingURL=utils.js.map