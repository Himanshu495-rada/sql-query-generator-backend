import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test timeout to 10 seconds
jest.setTimeout(10000);

// Silence console logs during tests
// Comment out to debug with console logs
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Keep error and warn for debugging
// global.console.error = jest.fn();
// global.console.warn = jest.fn(); 