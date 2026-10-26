import { readFile, writeFile } from "node:fs/promises";
import Module, { createRequire } from "node:module";
import path from "node:path";

type AnyFunction = (...args: unknown[]) => unknown;

/** Object.prototype's own members (toString, valueOf, ...) resolve normally so stubs convert to strings. */
function prototypeStub(name: string): object {
  return new Proxy(
    {},
    {
      get(target, key, receiver) {
        if (typeof key === "symbol" || key === "then") return undefined;
        if (key in Object.prototype) return Reflect.get(Object.prototype, key, receiver);
        return stub(`${name}#${key}`);
      },
    },
  );
}

/**
 * A stand-in for any part of the vscode API: every member is another stub, calls return stubs, `new` gives an object
 * whose missing members are stubs, and nothing is thenable. `overrides` replaces members at this level.
 */
export function stub(name: string, overrides: Record<string, unknown> = {}): any {
  const target = function () {} as unknown as AnyFunction & { prototype: object };
  target.prototype = prototypeStub(name);
  const members = new Map<string | symbol, unknown>();
  return new Proxy(target, {
    get(fn, key) {
      if (typeof key === "string" && key in overrides) return overrides[key];
      if (key === "then") return undefined;
      if (typeof key === "symbol" || key === "prototype") return Reflect.get(fn, key);
      if (!members.has(key)) members.set(key, stub(`${name}.${key}`));
      return members.get(key);
    },
    apply: () => stub(`${name}()`),
    construct: (_fn, _args, newTarget) => Object.create(newTarget.prototype),
  });
}

/**
 * The `vscode` module itself: esbuild's interop copies a module's own properties, so the overrides are own properties
 * and everything else falls through to a stub prototype.
 */
export function stubModule(name: string, overrides: Record<string, unknown>): object {
  return Object.assign(Object.create(stub(name)), overrides);
}

/** Requires a copy of the built bundle that also exports the internals the tests call, with `vscode` replaced. */
export async function loadExtension(distDir: string, vscode: object) {
  const original = path.join(distDir, "extension.cjs");
  const copy = path.join(distDir, "extension.test.cjs");
  await writeFile(copy, `${await readFile(original, "utf8")}\n;module.exports.__xrayviewer={Na,Yt,Xt,Nt,ji,zu,Mo,$t,ui,Eu,Cu,xrvSetEffort};\n`);
  const loader = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
  const load = loader._load;
  loader._load = function (this: unknown, request: string, ...rest: unknown[]) {
    return request === "vscode" ? vscode : load.call(this, request, ...rest);
  };
  try {
    return createRequire(import.meta.url)(copy);
  } finally {
    loader._load = load;
  }
}
