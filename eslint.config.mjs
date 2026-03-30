import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.es2021,
                // GJS / GNOME Shell globals
                global: 'readonly',
                imports: 'readonly',
                log: 'readonly',
                logError: 'readonly',
                print: 'readonly',
                printerr: 'readonly',
                console: 'readonly',
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
            },
        },
        rules: {
            // Relax rules that conflict with GJS patterns
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-constant-condition': 'off',
        },
    },
];
