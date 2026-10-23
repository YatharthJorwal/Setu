import tseslint from 'typescript-eslint';

// RULES C1 (no any) comes from the recommended set. C2 and C3 are enforced below for the sim core.
export default tseslint.config(
  { ignores: ['dist', 'public/data', 'scripts'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react-dom', 'three', 'three/*', '@react-three/*'] },
      ],
      'no-restricted-globals': ['error', 'window', 'document'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use sim/rng.ts (RULES C3).' },
        { object: 'Date', property: 'now', message: 'Use sim time, not the wall clock (RULES C3).' },
        { object: 'performance', property: 'now', message: 'Use sim time, not the wall clock (RULES C3).' },
      ],
    },
  },
);
