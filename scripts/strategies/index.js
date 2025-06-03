/**
 * RAG Search Strategy Factory
 * 
 * This module provides a factory for creating and managing different RAG search strategies.
 */

import { createVectorSearchStrategy } from './vector-search.js';
import { createHybridSearchStrategy } from './hybrid-search.js';
import { createCombinedSearchStrategy } from './combined-search.js';

// Available strategies
const STRATEGIES = {
  'vector-search': createVectorSearchStrategy,
  'hybrid-search': createHybridSearchStrategy,
  'combined-search': createCombinedSearchStrategy
};

/**
 * Create a search strategy
 * @param {String} strategyName - Name of the strategy to create
 * @param {Object} dbConfig - Database configuration
 * @returns {Object} Search strategy instance
 * @throws {Error} If strategy is not found
 */
export function createSearchStrategy(strategyName, dbConfig) {
  const strategyCreator = STRATEGIES[strategyName];
  
  if (!strategyCreator) {
    throw new Error(`Search strategy '${strategyName}' not found. Available strategies: ${Object.keys(STRATEGIES).join(', ')}`);
  }
  
  return strategyCreator(dbConfig);
}

/**
 * Get list of available strategy names
 * @returns {Array} List of available strategy names
 */
export function getAvailableStrategies() {
  return Object.keys(STRATEGIES);
}

export default {
  createSearchStrategy,
  getAvailableStrategies
};
