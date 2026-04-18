module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['js/**/*.js', '!js/main.js'],
  coverageThreshold: {
    global: {
      lines: 70,
    },
  },
};
