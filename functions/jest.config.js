/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': '@swc/jest',
  },
  moduleNameMapper: {
    '^firebase-kit/backend$': '<rootDir>/firebase-kit/src/backend/index.ts',
    '^firebase-kit/backend/(.*)$': '<rootDir>/firebase-kit/src/backend/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**',
  ],
  maxWorkers: '50%',
  testTimeout: 10000,
};
