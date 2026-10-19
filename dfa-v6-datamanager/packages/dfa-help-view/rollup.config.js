const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const typescript = require('@rollup/plugin-typescript');
const peerDepsExternal = require('rollup-plugin-peer-deps-external');
const postcss = require('rollup-plugin-postcss');
const terser = require('@rollup/plugin-terser');

const packageJson = require('./package.json');

module.exports = [
  // CommonJS build
  {
    input: 'src/index.ts',
    output: {
      file: packageJson.main,
      format: 'cjs',
      sourcemap: true,
      name: 'DFAHelpRenderer'
    },
    plugins: [
      peerDepsExternal(),
      resolve({
        browser: true
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: true,
        declarationDir: './dist/cjs'
      }),
      postcss({
        extract: true,
        minimize: true
      }),
      terser()
    ],
    external: ['react', 'react-dom', 'next']
  },
  // ES Module build
  {
    input: 'src/index.ts',
    output: {
      file: packageJson.module,
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      peerDepsExternal(),
      resolve({
        browser: true
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: true,
        declarationDir: './dist/esm'
      }),
      postcss({
        extract: true,
        minimize: true
      }),
      terser()
    ],
    external: ['react', 'react-dom', 'next']
  }
];
