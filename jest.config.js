module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['./tests/setup.js'],
  collectCoverageFrom: [
    'js/**/*.js',
    '!js/main.js',
    '!js/fan.js',
    '!js/firebase-service.js',
    '!js/venue-map.js',
  ],
  coverageThreshold: {
    global: {
      lines: 70,
    },
  },
};
