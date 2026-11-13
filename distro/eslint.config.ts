import baseConfig from "../eslint.config.ts";

export default [
  // CommonJS build config run by Node, not app source.
  { ignores: ['webpack.config.test.cjs'] },
  ...baseConfig,
];
