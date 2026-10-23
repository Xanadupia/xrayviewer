import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { scaleType, typeTokens } from "../scripts/type-scale.mjs";

describe("review page type scale", () => {
  test("maps hand-set sizes to the nearest of six steps", () => {
    assert.equal(scaleType(".a { font-size: 13.5px; }"), ".a { font-size: var(--fs-body); }");
    assert.equal(scaleType(".a{font-size:12.5px}"), ".a{font-size: var(--fs-callout)}");
    assert.equal(scaleType(".t { font-size: clamp(25px, 3vw, 34px); line-height: 1.1 }"), ".t { font-size: var(--fs-large); line-height: 1.1 }");
  });

  test("leaves tiny labels, the risk numeral, inherited and editor sizes alone", () => {
    const kept = ".av { font-size: 8px; } .n { font-size: 46px; } .x { font-size: inherit; } .rows { font-size: var(--code-size); }";
    assert.equal(scaleType(kept), kept);
  });

  test("declares the six steps once, at the root", () => {
    const tokens = typeTokens();
    assert.match(tokens, /^:root \{/);
    assert.deepEqual([...tokens.matchAll(/--fs-[\w-]+: (\d+)px/g)].map((m) => Number(m[1])), [11, 12, 13, 15, 22, 26]);
  });
});
