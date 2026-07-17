//#region src/utils.d.ts
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
declare const INTERNAL_JS_STUB_PROPS: ReadonlySet<string>;
/**
 * True when the property access is a JS-internal probe that must
 * NOT dispatch an RPC call. Catches all symbol keys plus the named
 * set above.
 *
 * @internal
 */
declare function isInternalJsStubProp(prop: string | symbol): boolean;
/**
 * Convert a camelCase string to a kebab-case string
 * @param str The string to convert
 * @returns The kebab-case string
 */
declare function camelCaseToKebabCase(str: string): string;
//#endregion
export {
  camelCaseToKebabCase as n,
  isInternalJsStubProp as r,
  INTERNAL_JS_STUB_PROPS as t
};
//# sourceMappingURL=utils-CGtGDSgA.d.ts.map
