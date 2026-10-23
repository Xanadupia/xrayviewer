/**
 * One type scale for the review page, after the macOS text styles: caption 11, callout 12, body 13, title 3 15,
 * title 1 22, large title 26. The vendor stylesheet sets about thirty sizes by hand; each maps to its nearest step.
 * Sizes under 11px sit inside avatars and rings and are left alone, and so is the risk score's display numeral.
 */
export const TYPE_STEPS = {
  "--fs-caption": "11px",
  "--fs-callout": "12px",
  "--fs-body": "13px",
  "--fs-title3": "15px",
  "--fs-title1": "22px",
  "--fs-large": "26px",
};

const STEP_FOR = new Map([
  ["10.5px", "--fs-caption"],
  ["11px", "--fs-caption"],
  ["11.5px", "--fs-caption"],
  ["12px", "--fs-callout"],
  ["12.5px", "--fs-callout"],
  ["13px", "--fs-body"],
  ["13.5px", "--fs-body"],
  ["14px", "--fs-body"],
  ["14.5px", "--fs-body"],
  ["15px", "--fs-title3"],
  ["15.5px", "--fs-title3"],
  ["16px", "--fs-title3"],
  ["16.5px", "--fs-title3"],
  ["17px", "--fs-title3"],
  ["18px", "--fs-title3"],
  ["19px", "--fs-title3"],
  ["20px", "--fs-title1"],
  ["21px", "--fs-title1"],
  ["22px", "--fs-title1"],
  ["24px", "--fs-title1"],
  ["30px", "--fs-large"],
  ["clamp(25px, 3vw, 34px)", "--fs-large"],
  ["clamp(30px, 4vw, 42px)", "--fs-large"],
]);

export function scaleType(css) {
  return css.replace(/font-size:\s*([^;}]+?)\s*(?=[;}])/g, (whole, value) => {
    const step = STEP_FOR.get(value);
    return step ? `font-size: var(${step})` : whole;
  });
}

export function typeTokens() {
  return `:root {\n${Object.entries(TYPE_STEPS).map(([name, size]) => `  ${name}: ${size};`).join("\n")}\n}\n`;
}
