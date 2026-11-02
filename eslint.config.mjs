import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
    {
        ignores: ['node_modules/**', 'dist/**', 'src/generated/**', 'coverage/**', 'storage/**', 'logs/**']
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node, ...globals.jest }
        },
        rules: {
            'linebreak-style': ['error', 'unix'],
            quotes: ['error', 'single', { avoidEscape: true }],
            semi: ['error', 'never'],
            curly: 'error',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }]
        }
    },
    {
        files: ['jest.config.js'],
        rules: { '@typescript-eslint/no-require-imports': 'off' }
    }
)
