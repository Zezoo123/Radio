import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'out/**', 'coverage/**'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: { react: { version: 'detect' } },
    plugins: { 'react-hooks': eslintPluginReactHooks },
    // The classic hooks rules only. v7's compiler-era additions
    // (set-state-in-effect, refs, immutability) flag load-then-set patterns
    // this app uses deliberately; adopting them is a refactor, not a lint fix.
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  eslintConfigPrettier
)
