import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      // This JavaScript codebase validates API payloads at service/form boundaries
      // and does not ship the optional PropTypes runtime.
      'react/prop-types': 'off',
      'react/jsx-no-target-blank': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Node 环境文件：Vite 配置与构建/校验脚本在浏览器之外运行，
    // 需要 process、require、__dirname 等全局变量。
    // 仅对本组文件生效，`src/**` 的 browser globals 约定保持不变。
    files: ['vite.config.js', 'scripts/**/*.{cjs,js}'],
    languageOptions: {
      globals: globals.node,
    },
  },
]
