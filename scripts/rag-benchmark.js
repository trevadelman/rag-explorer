/**
 * RAG Benchmarking Tool
 * 
 * This tool benchmarks different RAG configurations using:
 * - Different search strategies (vector search, hybrid search, etc.)
 * - Different embedding models (OpenAI small/large, Gemini)
 * - Different LLM models (OpenAI, Gemini)
 * - Different content types (xeto, markdown, documentation)
 * 
 * Metrics measured:
 * - Search time (vector search, hybrid search, etc.)
 * - LLM response time
 * - Total end-to-end time
 * - Cost (embedding + LLM)
 * - Result quality (based on expected keywords)
 */

import 'dotenv/config';
import { OpenAI } from 'openai';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import { createSearchStrategy, getAvailableStrategies } from './strategies/index.js';
import { Pool } from 'pg';
import chalk from 'chalk';

// Initialize clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Database configuration
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Create connection pool for database operations outside of search strategies
const pool = new Pool(dbConfig);

// Model configurations
const MODELS = {
  llm: {
    openai: process.env.OPENAI_MODEL,
    gemini_flash: process.env.GEMINI_FLASH_MODEL,
    gemini_pro: process.env.GEMINI_PRO_MODEL
  },
  embeddings: {
    openai_small: process.env.OPENAI_EMBEDDING_SMALL,
    openai_large: process.env.OPENAI_EMBEDDING_LARGE,
    gemini_stable: process.env.GEMINI_EMBEDDING_STABLE,
    gemini_beta: process.env.GEMINI_EMBEDDING_BETA
  }
};

// Cost estimates (in USD per 1000 tokens)
const COST_ESTIMATES = {
  llm: {
    // Input and output costs are different for LLMs
    input: {
      [process.env.OPENAI_MODEL]: 0.0004, // $0.40/1M tokens for gpt-4.1-mini
      [process.env.GEMINI_FLASH_MODEL]: 0.00015, // $0.15/1M tokens for gemini-2.5-flash
      [process.env.GEMINI_PRO_MODEL]: 0.00125 // $1.25/1M tokens for gemini-2.5-pro
    },
    output: {
      [process.env.OPENAI_MODEL]: 0.0016, // $1.60/1M tokens for gpt-4.1-mini
      [process.env.GEMINI_FLASH_MODEL]: 0.0006, // $0.60/1M tokens for gemini-2.5-flash
      [process.env.GEMINI_PRO_MODEL]: 0.01 // $10.00/1M tokens for gemini-2.5-pro
    }
  },
  embeddings: {
    [process.env.OPENAI_EMBEDDING_SMALL]: 0.00002, // $0.02/1M tokens for text-embedding-3-small
    [process.env.OPENAI_EMBEDDING_LARGE]: 0.00013, // $0.13/1M tokens for text-embedding-3-large
    [process.env.GEMINI_EMBEDDING_STABLE]: 0.00001, // $0.01/1M tokens for embedding-001
    [process.env.GEMINI_EMBEDDING_BETA]: 0.00001 // $0.01/1M tokens for embedding-001
  }
};

/**
 * Main benchmarking function
 */
async function runBenchmark(options = {}) {
  const {
    searchStrategies = ['vector-search'],
    llmModels = Object.values(MODELS.llm),
    embeddingModels = Object.values(MODELS.embeddings),
    contentTypes = ['xeto', 'markdown', 'documentation'],
    numQueries = 10,
    topK = 5,
    outputFile = 'benchmark-results.json'
  } = options;

  console.log(chalk.bold.blue('🔍 RAG Benchmarking Tool'));
  console.log(chalk.blue('======================='));
  console.log(chalk.cyan(`Search Strategies: ${chalk.white(searchStrategies.join(', '))}`));
  console.log(chalk.cyan(`LLM Models: ${chalk.white(llmModels.join(', '))}`));
  console.log(chalk.cyan(`Embedding Models: ${chalk.white(embeddingModels.join(', '))}`));
  console.log(chalk.cyan(`Content Types: ${chalk.white(contentTypes.join(', '))}`));
  console.log(chalk.cyan(`Number of Test Queries: ${chalk.white(numQueries.toString())}`));
  console.log(chalk.cyan(`Top K Results: ${chalk.white(topK.toString())}`));
  console.log(chalk.blue('=======================\n'));

  // Get test queries
  const testQueries = await getTestQueries(numQueries);
  console.log(chalk.green(`Loaded ${testQueries.length} test queries`));

  const results = [];

  // Run benchmarks for each combination
  for (const searchStrategy of searchStrategies) {
    for (const llmModel of llmModels) {
      for (const embeddingModel of embeddingModels) {
        // Skip incompatible dimension combinations
        const embeddingDimension = getEmbeddingDimension(embeddingModel);
        if (!embeddingDimension) {
          console.log(`Skipping ${embeddingModel} - dimension not supported`);
          continue;
        }

        for (const contentType of contentTypes) {
          console.log(chalk.bold.magenta(`\nTesting: Strategy=${chalk.white(searchStrategy)}, LLM=${chalk.white(llmModel)}, Embedding=${chalk.white(embeddingModel)}, Content=${chalk.white(contentType)}`));
          
          // Run benchmark for each query
          for (const query of testQueries) {
            try {
              console.log(chalk.cyan(`  Query: "${chalk.white(query.query_text.substring(0, 50))}..."`));
              
              const result = await benchmarkQuery(
                query,
                searchStrategy,
                llmModel,
                embeddingModel,
                contentType,
                topK
              );
              
              results.push(result);
              
              // Log result summary
              console.log(chalk.green(`    ✓ Search (${searchStrategy}): ${result.metrics.searchTime.toFixed(2)}ms, LLM: ${result.metrics.llmResponseTime.toFixed(2)}ms, Total: ${result.metrics.totalTime.toFixed(2)}ms`));
              console.log(chalk.green(`    ✓ Cost: $${result.metrics.totalCost.toFixed(6)}, Keywords matched: ${result.metrics.keywordsMatched}/${query.expected_keywords.length}`));
            } catch (error) {
              console.error(chalk.red(`    ✗ Error: ${error.message}`));
              results.push({
                query_id: query.id,
                query_text: query.query_text,
                search_strategy: searchStrategy,
                llm_model: llmModel,
                embedding_model: embeddingModel,
                content_type: contentType,
                error: error.message,
                success: false
              });
            }
          }
        }
      }
    }
  }

  // Create results directory if it doesn't exist
  const outputDir = path.dirname(outputFile);
  if (outputDir !== '.') {
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (err) {
      // Directory already exists, ignore
    }
  }

  // Save results to file
  await fs.writeFile(
    outputFile,
    JSON.stringify({ results, timestamp: new Date().toISOString() }, null, 2)
  );

  console.log(chalk.bold.green(`\n✅ Benchmark complete. Results saved to ${chalk.white(outputFile)}`));
  
  // Generate summary
  generateSummary(results);
  
  return results;
}

/**
 * Benchmark a single query
 */
async function benchmarkQuery(query, searchStrategy, llmModel, embeddingModel, contentType, topK) {
  const startTime = Date.now();
  const testRunId = generateUUID();
  
  // Step 1: Generate embedding for query
  const embeddingStartTime = Date.now();
  const queryEmbedding = await generateEmbedding(query.query_text, embeddingModel);
  const embeddingTime = Date.now() - embeddingStartTime;
  
  // Step 2: Perform search using the selected strategy
  const searchStartTime = Date.now();
  const embeddingDimension = getEmbeddingDimension(embeddingModel);
  
  // Create search strategy instance
  const searchStrategyInstance = createSearchStrategy(searchStrategy, dbConfig);
  
  // Perform search based on strategy type
  let searchResults;
  if (searchStrategy === 'vector-search') {
    searchResults = await searchStrategyInstance.search(
      queryEmbedding,
      embeddingModel,
      contentType,
      topK,
      embeddingDimension
    );
  } else if (searchStrategy === 'hybrid-search') {
    searchResults = await searchStrategyInstance.search(
      queryEmbedding,
      query.query_text,
      embeddingModel,
      contentType,
      topK,
      embeddingDimension
    );
  } else if (searchStrategy === 'combined-search') {
    searchResults = await searchStrategyInstance.search(
      queryEmbedding,
      query.query_text,
      embeddingModel,
      contentType,
      topK,
      embeddingDimension
    );
  } else {
    // Generic fallback for other strategies
    searchResults = await searchStrategyInstance.search(
      queryEmbedding,
      embeddingModel,
      contentType,
      topK,
      embeddingDimension
    );
  }
  
  const searchTime = Date.now() - searchStartTime;
  
  // Close the strategy's connection
  await searchStrategyInstance.close();
  
  // Step 3: Generate LLM response
  const llmStartTime = Date.now();
  const context = searchResults.map(r => r.content).join('\n\n');
  const llmResponse = await generateLLMResponse(
    query.query_text,
    context,
    llmModel
  );
  const llmResponseTime = Date.now() - llmStartTime;
  
  // Step 4: Calculate metrics
  const totalTime = Date.now() - startTime;
  
  // Calculate token counts (approximate)
  const queryTokens = countTokens(query.query_text);
  const contextTokens = countTokens(context);
  const responseTokens = countTokens(llmResponse);
  
  // Calculate costs
  const embeddingCost = calculateEmbeddingCost(queryTokens, embeddingModel);
  const llmCost = calculateLLMCost(queryTokens + contextTokens, responseTokens, llmModel);
  const totalCost = embeddingCost + llmCost;
  
  // Calculate keyword matches
  const keywordsMatched = countKeywordMatches(llmResponse, query.expected_keywords);
  
  // Create result object
  const result = {
    test_run_id: testRunId,
    query_id: query.id,
    query_text: query.query_text,
    search_strategy: searchStrategy,
    llm_model: llmModel,
    embedding_model: embeddingModel,
    content_type: contentType,
    response_text: llmResponse,
    retrieved_document_ids: searchResults.map(r => r.id),
    metrics: {
      embeddingTime,
      searchTime,
      llmResponseTime,
      totalTime,
      queryTokens,
      contextTokens,
      responseTokens,
      embeddingCost,
      llmCost,
      totalCost,
      keywordsMatched,
      keywordMatchPercentage: (keywordsMatched / query.expected_keywords.length) * 100
    },
    success: true,
    timestamp: new Date().toISOString()
  };
  
  // Save result to database
  await saveBenchmarkResult(result);
  
  return result;
}

/**
 * Generate embedding for query text
 */
async function generateEmbedding(text, model) {
  if (model.includes('text-embedding-3')) {
    // OpenAI embedding
    const response = await openai.embeddings.create({
      model: model,
      input: text,
      encoding_format: 'float'
    });
    return response.data[0].embedding;
  } else {
    // Gemini embedding - using the new API format
    const response = await genAI.models.embedContent({
      model: model,
      content: text
    });
    return response.embedding.values;
  }
}


/**
 * Generate LLM response
 */
async function generateLLMResponse(query, context, model) {
  const prompt = `
You are an expert in building automation systems, HVAC, and the Xeto specification language.
Answer the following question based on the provided context.

Context:
${context}

Question: ${query}

Provide a concise and accurate answer based only on the information in the context.
`;

  if (model.includes('gpt')) {
    // OpenAI
    const response = await openai.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500
    });
    return response.choices[0].message.content;
  } else {
    // Gemini - using the new API format
    const response = await genAI.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 500
      }
    });
    return response.text;
  }
}

/**
 * Get test queries from database
 */
async function getTestQueries(limit = 10) {
  const result = await pool.query(
    'SELECT id, category, query_text, expected_keywords, difficulty_level FROM test_queries ORDER BY RANDOM() LIMIT $1',
    [limit]
  );
  return result.rows;
}

/**
 * Save benchmark result to database
 */
async function saveBenchmarkResult(result) {
  await pool.query(
    `INSERT INTO benchmark_results (
      test_run_id, 
      query_text, 
      content_type, 
      embedding_model, 
      llm_model, 
      response_text, 
      retrieved_document_ids, 
      metrics
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      result.test_run_id,
      result.query_text,
      result.content_type,
      result.embedding_model,
      result.llm_model,
      result.response_text,
      result.retrieved_document_ids,
      JSON.stringify({
        ...result.metrics,
        search_strategy: result.search_strategy
      })
    ]
  );
  
  // Also save individual metrics
  for (const [metricName, metricValue] of Object.entries(result.metrics)) {
    if (typeof metricValue === 'number') {
      await pool.query(
        `INSERT INTO performance_metrics (
          test_run_id,
          metric_name,
          metric_value,
          metric_unit,
          metadata
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          result.test_run_id,
          metricName,
          metricValue,
          getMetricUnit(metricName),
          JSON.stringify({
            llm_model: result.llm_model,
            embedding_model: result.embedding_model,
            content_type: result.content_type,
            query_id: result.query_id
          })
        ]
      );
    }
  }
}

/**
 * Generate summary of benchmark results
 */
function generateSummary(results) {
  console.log(chalk.bold.blue('\n📊 Benchmark Summary'));
  console.log(chalk.blue('======================='));
  
  // Filter out failed results
  const successfulResults = results.filter(r => r.success);
  
  if (successfulResults.length === 0) {
    console.log(chalk.yellow('No successful benchmark results to summarize'));
    return;
  }
  
  // Group by search strategy
  const byStrategy = groupBy(successfulResults, 'search_strategy');
  console.log(chalk.bold.cyan('\nBy Search Strategy:'));
  for (const [strategy, strategyResults] of Object.entries(byStrategy)) {
    const avgTime = average(strategyResults.map(r => r.metrics.searchTime));
    const avgKeywords = average(strategyResults.map(r => r.metrics.keywordMatchPercentage));
    
    console.log(chalk.yellow(`  ${strategy}:`));
    console.log(chalk.white(`    Avg Search Time: ${avgTime.toFixed(2)}ms`));
    console.log(chalk.white(`    Avg Keyword Match: ${avgKeywords.toFixed(2)}%`));
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
  console.log(chalk.green(`  Fastest: ${chalk.white(`${fastestResult.search_strategy} + ${fastestResult.llm_model} + ${fastestResult.embedding_model} + ${fastestResult.content_type}`)}`));
  console.log(chalk.white(`    Total Time: ${fastestResult.metrics.totalTime.toFixed(2)}ms`));
  
  // Best for cost
  const cheapestResult = successfulResults.sort((a, b) => a.metrics.totalCost - b.metrics.totalCost)[0];
  console.log(chalk.green(`  Cheapest: ${chalk.white(`${cheapestResult.search_strategy} + ${cheapestResult.llm_model} + ${cheapestResult.embedding_model} + ${cheapestResult.content_type}`)}`));
  console.log(chalk.white(`    Total Cost: $${cheapestResult.metrics.totalCost.toFixed(6)}`));
  
  // Best for accuracy
  const mostAccurateResult = successfulResults.sort((a, b) => b.metrics.keywordMatchPercentage - a.metrics.keywordMatchPercentage)[0];
  console.log(chalk.green(`  Most Accurate: ${chalk.white(`${mostAccurateResult.search_strategy} + ${mostAccurateResult.llm_model} + ${mostAccurateResult.embedding_model} + ${mostAccurateResult.content_type}`)}`));
  console.log(chalk.white(`    Keyword Match: ${mostAccurateResult.metrics.keywordMatchPercentage.toFixed(2)}%`));
}

/**
 * Helper function to get embedding dimension
 */
function getEmbeddingDimension(model) {
  if (model.includes('text-embedding-3-small') || model.includes('text-embedding-004')) {
    return 1536;
  } else if (model.includes('text-embedding-3-large')) {
    return 3072;
  } else if (model.includes('gemini-embedding')) {
    return 768;
  }
  return null;
}

/**
 * Helper function to count tokens (approximate)
 */
function countTokens(text) {
  if (!text) return 0;
  // Approximate token count (4 chars per token)
  return Math.ceil(text.length / 4);
}

/**
 * Helper function to calculate embedding cost
 */
function calculateEmbeddingCost(tokens, model) {
  const rate = COST_ESTIMATES.embeddings[model] || 0.0001;
  return (tokens / 1000) * rate;
}

/**
 * Helper function to calculate LLM cost
 */
function calculateLLMCost(inputTokens, outputTokens, model) {
  // Get input and output rates for the model
  const inputRate = COST_ESTIMATES.llm.input[model] || 0.0004; // Default to gpt-4.1-mini rate
  const outputRate = COST_ESTIMATES.llm.output[model] || 0.0016; // Default to gpt-4.1-mini rate
  
  // Calculate cost separately for input and output tokens
  const inputCost = (inputTokens / 1000) * inputRate;
  const outputCost = (outputTokens / 1000) * outputRate;
  
  // Return total cost
  return inputCost + outputCost;
}

/**
 * Helper function to count keyword matches
 */
function countKeywordMatches(text, keywords) {
  if (!text || !keywords || keywords.length === 0) return 0;
  
  const lowerText = text.toLowerCase();
  let count = 0;
  
  // Check for negative phrases that indicate the response doesn't actually provide the information
  const negativePatterns = [
    'does not provide',
    'doesn\'t provide',
    'no information',
    'not mentioned',
    'not specified',
    'not found',
    'not available',
    'cannot find',
    'could not find',
    'unable to find',
    'the context does not',
    'the provided context does not',
    'the information is not',
    'no details',
    'no data',
    'not present',
    'not included'
  ];
  
  // Check if the response contains negative patterns
  const hasNegativePattern = negativePatterns.some(pattern => lowerText.includes(pattern));
  
  // If the response has negative patterns, it's likely a false positive
  if (hasNegativePattern) {
    // Check if the response is just saying it doesn't have information
    // If it's a purely negative response, don't count any keywords
    if (keywords.every(keyword => {
      const keywordLower = keyword.toLowerCase();
      // Check if the keyword appears in a negative context
      return negativePatterns.some(pattern => 
        lowerText.includes(`${pattern} about ${keywordLower}`) || 
        lowerText.includes(`${pattern} on ${keywordLower}`) ||
        lowerText.includes(`${pattern} regarding ${keywordLower}`)
      );
    })) {
      return 0;
    }
  }
  
  // Count keywords that appear in the response
  for (const keyword of keywords) {
    const keywordLower = keyword.toLowerCase();
    
    // Simple presence check
    if (lowerText.includes(keywordLower)) {
      // If there are negative patterns, do a more careful check
      if (hasNegativePattern) {
        // Check if the keyword is mentioned in a positive context
        // This is a simple heuristic - we look for sentences containing the keyword
        // that don't contain negative patterns
        const sentences = lowerText.split(/[.!?]+/);
        const keywordSentences = sentences.filter(s => s.includes(keywordLower));
        
        // If at least one sentence with the keyword doesn't have negative patterns,
        // count it as a match
        if (keywordSentences.some(sentence => 
          !negativePatterns.some(pattern => sentence.includes(pattern))
        )) {
          count++;
        }
      } else {
        // No negative patterns, so count the keyword
        count++;
      }
    }
  }
  
  return count;
}

/**
 * Helper function to get metric unit
 */
function getMetricUnit(metricName) {
  if (metricName.includes('Time')) {
    return 'ms';
  } else if (metricName.includes('Cost')) {
    return 'USD';
  } else if (metricName.includes('Tokens')) {
    return 'tokens';
  } else if (metricName.includes('Percentage')) {
    return '%';
  }
  return '';
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

/**
 * Helper function to generate UUID
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Close database connection
 */
async function closeConnection() {
  await pool.end();
  console.log(chalk.gray('Database connection closed'));
}

// Export functions
export {
  runBenchmark,
  closeConnection
};

// Run benchmark if called directly
if (process.argv[1] === import.meta.url) {
  runBenchmark()
    .catch(console.error)
    .finally(() => closeConnection());
}
