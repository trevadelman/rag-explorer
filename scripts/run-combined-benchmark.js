#!/usr/bin/env node

/**
 * Combined Search Strategy RAG Benchmarking Tool
 * 
 * This script runs benchmarks for the combined search strategy with:
 * - Different LLM models (OpenAI, Gemini)
 * - Different embedding models (OpenAI small/large, Gemini)
 * - Different content types (xeto, markdown, documentation)
 * - Different context sizes (small, medium, large)
 * 
 * The combined search strategy integrates vector search, keyword search, and BM25 ranking
 * to provide the most comprehensive and accurate results possible.
 */

import 'dotenv/config';
import { runBenchmark, closeConnection } from './rag-benchmark.js';
import fs from 'fs/promises';
import chalk from 'chalk';

// Configuration
const CONFIG = {
  // Only use the combined search strategy
  searchStrategies: [
    'combined-search'
  ],
  
  // LLM models to benchmark
  llmModels: [
    process.env.OPENAI_MODEL,           // OpenAI model (e.g., gpt-4.1-mini)
    process.env.GEMINI_FLASH_MODEL,     // Gemini Flash model
    process.env.GEMINI_PRO_MODEL        // Gemini Pro model
  ],
  
  // Embedding models to benchmark
  embeddingModels: [
    process.env.OPENAI_EMBEDDING_SMALL, // OpenAI small embedding model
    process.env.OPENAI_EMBEDDING_LARGE, // OpenAI large embedding model
    process.env.GEMINI_EMBEDDING_STABLE // Gemini stable embedding model
  ],
  
  // Content types to benchmark
  contentTypes: [
    'xeto',
    'markdown',
    'documentation'
  ],
  
  // Context sizes to benchmark (number of documents to include)
  contextSizes: [
    { name: 'small', topK: 1 },
    { name: 'medium', topK: 5 },
    { name: 'large', topK: 10 }
  ],
  
  // Number of test queries to run for each combination
  numQueries: 1,
  
  // Output file for all results
  outputFile: 'results/combined-benchmark.json'
};

/**
 * Run combined search strategy benchmarks
 */
async function runCombinedBenchmarks() {
  console.log(chalk.bold.blue('🔍 Combined Search Strategy RAG Benchmarking'));
  console.log(chalk.blue('==========================================='));
  console.log(chalk.cyan(`Search Strategy: ${chalk.white(CONFIG.searchStrategies[0])}`));
  console.log(chalk.cyan(`LLM Models: ${chalk.white(CONFIG.llmModels.join(', '))}`));
  console.log(chalk.cyan(`Embedding Models: ${chalk.white(CONFIG.embeddingModels.join(', '))}`));
  console.log(chalk.cyan(`Content Types: ${chalk.white(CONFIG.contentTypes.join(', '))}`));
  console.log(chalk.cyan(`Context Sizes: ${chalk.white(CONFIG.contextSizes.map(cs => `${cs.name} (${cs.topK})`).join(', '))}`));
  console.log(chalk.cyan(`Queries per combination: ${chalk.white(CONFIG.numQueries.toString())}`));
  console.log(chalk.blue('===========================================\n'));
  
  const allResults = [];
  const totalCombinations = CONFIG.llmModels.length * CONFIG.embeddingModels.length * CONFIG.contentTypes.length * CONFIG.contextSizes.length;
  let completedCombinations = 0;
  
  // Run benchmarks for each combination
  for (const llmModel of CONFIG.llmModels) {
    for (const embeddingModel of CONFIG.embeddingModels) {
      for (const contentType of CONFIG.contentTypes) {
        for (const contextSize of CONFIG.contextSizes) {
          completedCombinations++;
          console.log(chalk.bold.magenta(`\n🔄 Running combination ${completedCombinations}/${totalCombinations}:`));
          console.log(chalk.cyan(`   Strategy: ${chalk.white(CONFIG.searchStrategies[0])}`));
          console.log(chalk.cyan(`   LLM: ${chalk.white(llmModel)}`));
          console.log(chalk.cyan(`   Embedding: ${chalk.white(embeddingModel)}`));
          console.log(chalk.cyan(`   Content: ${chalk.white(contentType)}`));
          console.log(chalk.cyan(`   Context Size: ${chalk.white(`${contextSize.name} (${contextSize.topK} documents)`)}`));
      
          try {
            // Run benchmark for this combination
            const results = await runBenchmark({
              searchStrategies: CONFIG.searchStrategies,
              llmModels: [llmModel],
              embeddingModels: [embeddingModel],
              contentTypes: [contentType],
              numQueries: CONFIG.numQueries,
              topK: contextSize.topK,
              outputFile: `temp-${CONFIG.searchStrategies[0]}-${llmModel}-${embeddingModel}-${contentType}-${contextSize.name}.json`
            });
            
            // Add combination info to each result
            const enhancedResults = results.map(result => ({
              ...result,
              combination: {
                searchStrategy: CONFIG.searchStrategies[0],
                llmModel,
                embeddingModel,
                contentType,
                contextSize: contextSize.name,
                topK: contextSize.topK,
                combinationId: `${completedCombinations}`
              }
            }));
          
            // Add to all results
            allResults.push(...enhancedResults);
            
            console.log(chalk.green(`✅ Combination ${completedCombinations}/${totalCombinations} completed`));
          } catch (error) {
            console.error(chalk.red(`❌ Error running combination ${completedCombinations}/${totalCombinations}:`), error.message);
          }
        }
      }
    }
  }
  
  // Save all results to a single file
  await fs.writeFile(
    CONFIG.outputFile,
    JSON.stringify({ 
      results: allResults, 
      timestamp: new Date().toISOString(),
      config: CONFIG
    }, null, 2)
  );
  
  console.log(chalk.bold.green(`\n✅ Combined search strategy benchmarking complete!`));
  console.log(chalk.cyan(`Results saved to ${chalk.white(CONFIG.outputFile)}`));
  
  // Generate summary
  generateSummary(allResults);
  
  return allResults;
}

/**
 * Generate summary of benchmark results
 */
function generateSummary(results) {
  console.log(chalk.bold.blue('\n📊 Combined Search Strategy Benchmark Summary'));
  console.log(chalk.blue('=============================================='));
  
  // Filter out failed results
  const successfulResults = results.filter(r => r.success);
  
  if (successfulResults.length === 0) {
    console.log(chalk.yellow('No successful benchmark results to summarize'));
    return;
  }
  
  // Group by LLM model
  const byLLM = groupBy(successfulResults, 'llm_model');
  console.log(chalk.bold.cyan('\nBy LLM Model:'));
  for (const [model, modelResults] of Object.entries(byLLM)) {
    const avgTime = average(modelResults.map(r => r.metrics.llmResponseTime));
    const avgCost = average(modelResults.map(r => r.metrics.llmCost));
    const avgKeywords = average(modelResults.map(r => r.metrics.keywordMatchPercentage));
    
    console.log(chalk.yellow(`  ${model}:`));
    console.log(chalk.white(`    Avg Response Time: ${avgTime.toFixed(2)}ms`));
    console.log(chalk.white(`    Avg Cost: $${avgCost.toFixed(6)}`));
    console.log(chalk.white(`    Avg Keyword Match: ${avgKeywords.toFixed(2)}%`));
  }
  
  // Group by context size
  const byContextSize = groupBy(successfulResults, result => result.combination.contextSize);
  console.log(chalk.bold.cyan('\nBy Context Size:'));
  for (const [size, sizeResults] of Object.entries(byContextSize)) {
    const avgTime = average(sizeResults.map(r => r.metrics.llmResponseTime));
    const avgCost = average(sizeResults.map(r => r.metrics.llmCost));
    const avgKeywords = average(sizeResults.map(r => r.metrics.keywordMatchPercentage));
    const avgContextTokens = average(sizeResults.map(r => r.metrics.contextTokens));
    
    console.log(chalk.yellow(`  ${size}:`));
    console.log(chalk.white(`    Avg LLM Response Time: ${avgTime.toFixed(2)}ms`));
    console.log(chalk.white(`    Avg Context Tokens: ${avgContextTokens.toFixed(0)}`));
    console.log(chalk.white(`    Avg Cost: $${avgCost.toFixed(6)}`));
    console.log(chalk.white(`    Avg Keyword Match: ${avgKeywords.toFixed(2)}%`));
  }
  
  // Group by embedding model
  const byEmbedding = groupBy(successfulResults, 'embedding_model');
  console.log(chalk.bold.cyan('\nBy Embedding Model:'));
  for (const [model, modelResults] of Object.entries(byEmbedding)) {
    const avgTime = average(modelResults.map(r => r.metrics.searchTime));
    const avgCost = average(modelResults.map(r => r.metrics.embeddingCost));
    
    console.log(chalk.yellow(`  ${model}:`));
    console.log(chalk.white(`    Avg Search Time: ${avgTime.toFixed(2)}ms`));
    console.log(chalk.white(`    Avg Cost: $${avgCost.toFixed(6)}`));
  }
  
  // Group by content type
  const byContentType = groupBy(successfulResults, 'content_type');
  console.log(chalk.bold.cyan('\nBy Content Type:'));
  for (const [type, typeResults] of Object.entries(byContentType)) {
    const avgKeywords = average(typeResults.map(r => r.metrics.keywordMatchPercentage));
    const avgTime = average(typeResults.map(r => r.metrics.totalTime));
    
    console.log(chalk.yellow(`  ${type}:`));
    console.log(chalk.white(`    Avg Total Time: ${avgTime.toFixed(2)}ms`));
    console.log(chalk.white(`    Avg Keyword Match: ${avgKeywords.toFixed(2)}%`));
  }
  
  // Best combinations
  console.log(chalk.bold.cyan('\nBest Combinations:'));
  
  // Best for speed
  const fastestResult = successfulResults.sort((a, b) => a.metrics.totalTime - b.metrics.totalTime)[0];
  console.log(chalk.green(`  Fastest: ${chalk.white(`${fastestResult.llm_model} + ${fastestResult.embedding_model} + ${fastestResult.content_type}`)}`));
  console.log(chalk.white(`    Total Time: ${fastestResult.metrics.totalTime.toFixed(2)}ms`));
  
  // Best for cost
  const cheapestResult = successfulResults.sort((a, b) => a.metrics.totalCost - b.metrics.totalCost)[0];
  console.log(chalk.green(`  Cheapest: ${chalk.white(`${cheapestResult.llm_model} + ${cheapestResult.embedding_model} + ${cheapestResult.content_type}`)}`));
  console.log(chalk.white(`    Total Cost: $${cheapestResult.metrics.totalCost.toFixed(6)}`));
  
  // Best for accuracy
  const mostAccurateResult = successfulResults.sort((a, b) => b.metrics.keywordMatchPercentage - a.metrics.keywordMatchPercentage)[0];
  console.log(chalk.green(`  Most Accurate: ${chalk.white(`${mostAccurateResult.llm_model} + ${mostAccurateResult.embedding_model} + ${mostAccurateResult.content_type}`)}`));
  console.log(chalk.white(`    Keyword Match: ${mostAccurateResult.metrics.keywordMatchPercentage.toFixed(2)}%`));
  
  // Best overall (weighted score)
  const weightedResults = successfulResults.map(result => {
    // Normalize metrics to 0-1 scale
    const timeScore = 1 - (result.metrics.totalTime / Math.max(...successfulResults.map(r => r.metrics.totalTime)));
    const costScore = 1 - (result.metrics.totalCost / Math.max(...successfulResults.map(r => r.metrics.totalCost)));
    const accuracyScore = result.metrics.keywordMatchPercentage / 100;
    
    // Calculate weighted score (equal weights for simplicity)
    const weightedScore = (timeScore + costScore + accuracyScore) / 3;
    
    return {
      ...result,
      weightedScore
    };
  });
  
  const bestOverallResult = weightedResults.sort((a, b) => b.weightedScore - a.weightedScore)[0];
  console.log(chalk.green(`  Best Overall: ${chalk.white(`${bestOverallResult.llm_model} + ${bestOverallResult.embedding_model} + ${bestOverallResult.content_type}`)}`));
  console.log(chalk.white(`    Score: ${(bestOverallResult.weightedScore * 100).toFixed(2)}%`));
  console.log(chalk.white(`    Time: ${bestOverallResult.metrics.totalTime.toFixed(2)}ms`));
  console.log(chalk.white(`    Cost: $${bestOverallResult.metrics.totalCost.toFixed(6)}`));
  console.log(chalk.white(`    Accuracy: ${bestOverallResult.metrics.keywordMatchPercentage.toFixed(2)}%`));
}

/**
 * Helper function to group array by property
 */
function groupBy(array, key) {
  return array.reduce((result, item) => {
    (result[item[key]] = result[item[key]] || []).push(item);
    return result;
  }, {});
}

/**
 * Helper function to calculate average
 */
function average(array) {
  return array.reduce((sum, value) => sum + value, 0) / array.length;
}

// Run the combined search strategy benchmarks
runCombinedBenchmarks()
  .catch(console.error)
  .finally(() => closeConnection());
