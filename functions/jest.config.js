/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^firebase-kit/backend$': '<rootDir>/firebase-kit/src/backend/index.ts',
    '^firebase-kit/backend/(.*)$': '<rootDir>/firebase-kit/src/backend/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**',
  ],
};
