export default {
  ignoreFiles: ["app/letterboxd/**"],
  rules: {
    "at-rule-no-unknown": true,
    "block-no-empty": true,
    "declaration-block-no-duplicate-properties": true,
    "keyframe-block-no-duplicate-selectors": true,
    "no-duplicate-selectors": true,
    "property-no-unknown": true,
    "selector-pseudo-class-no-unknown": [
      true,
      { ignorePseudoClasses: ["global", "local"] },
    ],
  },
};
