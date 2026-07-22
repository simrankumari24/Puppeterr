/**
 * Strider Integration Test
 * 
 * Demonstrates how to use the Strider autonomous web crawler system.
 * Can be run standalone or integrated into Puppeterr agent tasks.
 */

const StriderAgent = require('./strider-agent');

/**
 * Example 1: Basic crawling with seed URLs
 */
async function testBasicCrawl() {
  console.log('\n=== Test 1: Basic Crawl ===');
  const strider = new StriderAgent({ workerCount: 2 });

  const seedUrls = [
    'https://example.com',
    'https://wikipedia.org',
  ];

  // Start crawler (will run indefinitely)
  strider.start(seedUrls).catch(console.error);

  // Let it run for 30 seconds, then stop
  await new Promise(resolve => setTimeout(resolve, 30000));
  await strider.stop();
}

/**
 * Example 2: Random walk exploration mode
 */
async function testRandomWalk() {
  console.log('\n=== Test 2: Random Walk Mode ===');
  const strider = new StriderAgent({
    workerCount: 1,
    randomWalkMode: true,
  });

  strider.start(['https://example.com']).catch(console.error);

  // Enable random walk
  strider.setRandomWalkMode(true);

  await new Promise(resolve => setTimeout(resolve, 20000));
  await strider.stop();
}

/**
 * Example 3: Enqueue URLs dynamically
 */
async function testDynamicEnqueue() {
  console.log('\n=== Test 3: Dynamic Enqueue ===');
  const strider = new StriderAgent({ workerCount: 1 });

  strider.start(['https://example.com']).catch(console.error);

  // Dynamically add more URLs
  setTimeout(() => {
    console.log('📍 Adding URLs dynamically...');
    strider.enqueue('https://github.com');
    strider.enqueue('https://stackoverflow.com');
  }, 5000);

  await new Promise(resolve => setTimeout(resolve, 25000));
  await strider.stop();
}

/**
 * Export for use in agent.js
 */
module.exports = {
  StriderAgent,
  testBasicCrawl,
  testRandomWalk,
  testDynamicEnqueue,
};

// Uncomment to run tests standalone:
// testBasicCrawl().catch(console.error);
