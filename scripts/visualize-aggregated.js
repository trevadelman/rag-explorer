#!/usr/bin/env node

/**
 * RAG Aggregated Benchmark Visualization Tool
 * 
 * This script generates visualizations from multiple benchmark result files
 * to help analyze and compare different RAG configurations across multiple runs.
 */

import fs from 'fs/promises';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default results directory
const RESULTS_DIR = 'results';
const OUTPUT_FILE = 'results/aggregated-benchmark-report.html';
const port = parseInt(process.env.PORT || '3000', 10);

/**
 * Main function
 */
async function main() {
  try {
    console.log(`Reading benchmark results from ${RESULTS_DIR} directory...`);
    
    // Get all benchmark files
    const files = await fs.readdir(RESULTS_DIR);
    const benchmarkFiles = files.filter(file => 
      file.startsWith('benchmark-') && file.endsWith('.json')
    );
    
    if (benchmarkFiles.length === 0) {
      console.error(`No benchmark files found in ${RESULTS_DIR} directory.`);
      process.exit(1);
    }
    
    console.log(`Found ${benchmarkFiles.length} benchmark files.`);
    
    // Aggregate results from all files
    const aggregatedResults = {
      results: [],
      timestamps: [],
      configs: []
    };
    
    for (const file of benchmarkFiles) {
      const filePath = path.join(RESULTS_DIR, file);
      console.log(`Processing ${filePath}...`);
      
      try {
        const data = await fs.readFile(filePath, 'utf8');
        const benchmarkData = JSON.parse(data);
        
        // Add run identifier to each result
        const runId = path.basename(file, '.json');
        const enhancedResults = benchmarkData.results.map(result => ({
          ...result,
          run_id: runId
        }));
        
        aggregatedResults.results.push(...enhancedResults);
        aggregatedResults.timestamps.push(benchmarkData.timestamp);
        aggregatedResults.configs.push(benchmarkData.config);
      } catch (error) {
        console.error(`Error processing ${filePath}: ${error.message}`);
      }
    }
    
    console.log(`Aggregated ${aggregatedResults.results.length} benchmark results from ${benchmarkFiles.length} files.`);
    
    // Generate HTML report
    const htmlReport = generateHtmlReport(aggregatedResults);
    
    // Save HTML report
    await fs.writeFile(OUTPUT_FILE, htmlReport);
    console.log(`Report generated: ${OUTPUT_FILE}`);
    
    // Start HTTP server to view the report
    const server = createServer(async (req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(htmlReport);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    
    server.listen(port, () => {
      console.log(`Server running at http://localhost:${port}/`);
      console.log('Press Ctrl+C to stop the server');
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

/**
 * Generate HTML report
 */
function generateHtmlReport(aggregatedData) {
  const { results, timestamps, configs } = aggregatedData;
  
  // Filter out failed results
  const successfulResults = results.filter(r => r.success);
  
  if (successfulResults.length === 0) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>RAG Aggregated Benchmark Results</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
          </style>
        </head>
        <body>
          <h1>RAG Aggregated Benchmark Results</h1>
          <p>No successful benchmark results found.</p>
        </body>
      </html>
    `;
  }
  
  // Group results
  const byStrategy = groupBy(successfulResults, 'search_strategy');
  const byLLM = groupBy(successfulResults, 'llm_model');
  const byEmbedding = groupBy(successfulResults, 'embedding_model');
  const byContentType = groupBy(successfulResults, 'content_type');
  const byRun = groupBy(successfulResults, 'run_id');
  
  // Group by context size
  const byContextSize = {};
  
  // Group results by context size
  for (const result of successfulResults) {
    let contextSizeKey = 'unknown';
    
    // First try to get the named context size (small, medium, large)
    if (result.combination && result.combination.contextSize) {
      contextSizeKey = result.combination.contextSize;
    }
    // If not available, use topK value
    else if (result.combination && result.combination.topK) {
      contextSizeKey = `topK-${result.combination.topK}`;
    }
    // If neither is available, try to get from retrieved_document_ids length
    else if (result.retrieved_document_ids && result.retrieved_document_ids.length) {
      contextSizeKey = `topK-${result.retrieved_document_ids.length}`;
    }
    
    // Initialize the array for this context size if it doesn't exist
    if (!byContextSize[contextSizeKey]) {
      byContextSize[contextSizeKey] = [];
    }
    
    // Add the result to the appropriate context size group
    byContextSize[contextSizeKey].push(result);
  }
  
  // Calculate averages
  const strategyAverages = calculateAverages(byStrategy, 'search_strategy');
  const llmAverages = calculateAverages(byLLM, 'llm_model');
  const embeddingAverages = calculateAverages(byEmbedding, 'embedding_model');
  const contentTypeAverages = calculateAverages(byContentType, 'content_type');
  const runAverages = calculateAverages(byRun, 'run_id');
  
  // Calculate averages for context size
  const contextSizeAverages = {};
  for (const [size, items] of Object.entries(byContextSize)) {
    const metrics = {
      count: items.length,
      totalTime: average(items.map(item => item.metrics.totalTime)),
      llmResponseTime: average(items.map(item => item.metrics.llmResponseTime)),
      vectorSearchTime: average(items.map(item => item.metrics.vectorSearchTime || 0)),
      searchTime: average(items.map(item => item.metrics.searchTime || item.metrics.vectorSearchTime || 0)),
      embeddingTime: average(items.map(item => item.metrics.embeddingTime)),
      embeddingCost: average(items.map(item => item.metrics.embeddingCost)),
      llmCost: average(items.map(item => item.metrics.llmCost)),
      totalCost: average(items.map(item => item.metrics.totalCost)),
      keywordMatchPercentage: average(items.map(item => item.metrics.keywordMatchPercentage)),
      contextTokens: average(items.map(item => item.metrics.contextTokens || 0))
    };
    
    contextSizeAverages[size] = metrics;
  }
  
  // Extract unique models, content types, and search strategies from all configs
  const allLLMModels = new Set();
  const allEmbeddingModels = new Set();
  const allContentTypes = new Set();
  const allSearchStrategies = new Set();
  
  configs.forEach(config => {
    if (config.llmModels) config.llmModels.forEach(model => allLLMModels.add(model));
    if (config.embeddingModels) config.embeddingModels.forEach(model => allEmbeddingModels.add(model));
    if (config.contentTypes) config.contentTypes.forEach(type => allContentTypes.add(type));
    if (config.searchStrategies) config.searchStrategies.forEach(strategy => allSearchStrategies.add(strategy));
  });
  
  // Add any search strategies found in results that might not be in configs
  successfulResults.forEach(result => {
    if (result.search_strategy) allSearchStrategies.add(result.search_strategy);
  });
  
  // If no search strategies were found, add a default one
  if (allSearchStrategies.size === 0) {
    allSearchStrategies.add('vector-search');
  }
  
  // Calculate combination averages
  const combinationResults = [];
  
  for (const searchStrategy of allSearchStrategies) {
    for (const llmModel of allLLMModels) {
      for (const embeddingModel of allEmbeddingModels) {
        for (const contentType of allContentTypes) {
          const combinationKey = `${searchStrategy}-${llmModel}-${embeddingModel}-${contentType}`;
          const combinationData = successfulResults.filter(
            r => (r.search_strategy || 'vector-search') === searchStrategy && 
                 r.llm_model === llmModel && 
                 r.embedding_model === embeddingModel && 
                 r.content_type === contentType
          );
          
          if (combinationData.length > 0) {
            const avgMetrics = {
              totalTime: average(combinationData.map(r => r.metrics.totalTime)),
              llmResponseTime: average(combinationData.map(r => r.metrics.llmResponseTime)),
              vectorSearchTime: average(combinationData.map(r => r.metrics.vectorSearchTime)),
              embeddingTime: average(combinationData.map(r => r.metrics.embeddingTime)),
              totalCost: average(combinationData.map(r => r.metrics.totalCost)),
              llmCost: average(combinationData.map(r => r.metrics.llmCost)),
              embeddingCost: average(combinationData.map(r => r.metrics.embeddingCost)),
              keywordMatchPercentage: average(combinationData.map(r => r.metrics.keywordMatchPercentage))
            };
            
            combinationResults.push({
              searchStrategy,
              llmModel,
              embeddingModel,
              contentType,
              combinationKey,
              count: combinationData.length,
              metrics: avgMetrics
            });
          }
        }
      }
    }
  }
  
  // Find best combinations
  const fastestCombination = combinationResults.sort((a, b) => a.metrics.totalTime - b.metrics.totalTime)[0];
  const cheapestCombination = combinationResults.sort((a, b) => a.metrics.totalCost - b.metrics.totalCost)[0];
  const mostAccurateCombination = combinationResults.sort((a, b) => b.metrics.keywordMatchPercentage - a.metrics.keywordMatchPercentage)[0];
  
  // Calculate weighted scores for each combination
  const weightedCombinations = combinationResults.map(combination => {
    // Normalize metrics to 0-1 scale
    const maxTime = Math.max(...combinationResults.map(c => c.metrics.totalTime));
    const maxCost = Math.max(...combinationResults.map(c => c.metrics.totalCost));
    
    const timeScore = 1 - (combination.metrics.totalTime / maxTime);
    const costScore = 1 - (combination.metrics.totalCost / maxCost);
    const accuracyScore = combination.metrics.keywordMatchPercentage / 100;
    
    // Calculate weighted score (equal weights for simplicity)
    const weightedScore = (timeScore + costScore + accuracyScore) / 3;
    
    return {
      ...combination,
      scores: {
        timeScore,
        costScore,
        accuracyScore,
        weightedScore
      }
    };
  });
  
  const bestOverallCombination = weightedCombinations.sort((a, b) => b.scores.weightedScore - a.scores.weightedScore)[0];
  
  // Generate HTML
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>RAG Aggregated Benchmark Results</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
            background-color: white;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          }
          h1, h2, h3 {
            color: #333;
          }
          .summary-cards {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            flex-wrap: wrap;
          }
          .card {
            background-color: white;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            padding: 15px;
            margin-bottom: 15px;
            flex: 1;
            min-width: 250px;
            margin-right: 15px;
          }
          .card:last-child {
            margin-right: 0;
          }
          .card h3 {
            margin-top: 0;
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th, td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #ddd;
          }
          th {
            background-color: #f2f2f2;
          }
          tr:hover {
            background-color: #f5f5f5;
          }
          .highlight {
            background-color: #e6f7ff;
            font-weight: bold;
          }
          .tabs {
            display: flex;
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
            flex-wrap: wrap;
          }
          .tab {
            padding: 10px 20px;
            cursor: pointer;
            border: 1px solid transparent;
            border-bottom: none;
            margin-right: 5px;
            border-radius: 5px 5px 0 0;
          }
          .tab.active {
            background-color: white;
            border-color: #ddd;
            border-bottom: 2px solid white;
            margin-bottom: -1px;
            font-weight: bold;
          }
          .tab-content {
            display: none;
          }
          .tab-content.active {
            display: block;
          }
          .chart {
            width: 100%;
            height: auto;
            margin-bottom: 40px;
            background-color: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 10px;
            box-sizing: border-box;
            overflow: visible;
          }
          .chart-bar {
            height: 30px;
            background-color: #4CAF50;
            margin-bottom: 15px;
            position: relative;
            clear: both;
            border-radius: 4px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .chart-label {
            position: absolute;
            left: 10px;
            top: 5px;
            color: white;
            font-size: 12px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 80%;
          }
          .chart-value {
            position: absolute;
            right: 10px;
            top: 5px;
            color: white;
            font-weight: bold;
          }
          pre {
            background: #f5f5f5;
            padding: 10px;
            border-radius: 3px;
            overflow-x: auto;
            white-space: pre-wrap;
            font-size: 12px;
          }
          @media (max-width: 768px) {
            .card {
              width: 100%;
              margin-right: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>RAG Aggregated Benchmark Results</h1>
          <p>Aggregated from ${Object.keys(byRun).length} benchmark runs</p>
          <p>Total benchmarks: ${successfulResults.length}</p>
          
          <h2>Best Configurations</h2>
          <div class="summary-cards">
            <div class="card">
              <h3>Best Overall Configuration</h3>
              <p><strong>Strategy:</strong> ${bestOverallCombination.searchStrategy}</p>
              <p><strong>LLM:</strong> ${bestOverallCombination.llmModel}</p>
              <p><strong>Embedding:</strong> ${bestOverallCombination.embeddingModel}</p>
              <p><strong>Content Type:</strong> ${bestOverallCombination.contentType}</p>
              <p><strong>Overall Score:</strong> ${(bestOverallCombination.scores.weightedScore * 100).toFixed(2)}%</p>
              <p><strong>Speed Score:</strong> ${(bestOverallCombination.scores.timeScore * 100).toFixed(2)}%</p>
              <p><strong>Cost Score:</strong> ${(bestOverallCombination.scores.costScore * 100).toFixed(2)}%</p>
              <p><strong>Accuracy Score:</strong> ${(bestOverallCombination.scores.accuracyScore * 100).toFixed(2)}%</p>
            </div>
            
            <div class="card">
              <h3>Fastest Configuration</h3>
              <p><strong>Strategy:</strong> ${fastestCombination.searchStrategy}</p>
              <p><strong>LLM:</strong> ${fastestCombination.llmModel}</p>
              <p><strong>Embedding:</strong> ${fastestCombination.embeddingModel}</p>
              <p><strong>Content Type:</strong> ${fastestCombination.contentType}</p>
              <p><strong>Total Time:</strong> ${fastestCombination.metrics.totalTime.toFixed(2)}ms</p>
              <p><strong>LLM Time:</strong> ${fastestCombination.metrics.llmResponseTime.toFixed(2)}ms</p>
              <p><strong>Search Time:</strong> ${fastestCombination.metrics.searchTime ? fastestCombination.metrics.searchTime.toFixed(2) : fastestCombination.metrics.vectorSearchTime ? fastestCombination.metrics.vectorSearchTime.toFixed(2) : "N/A"}ms</p>
            </div>
            
            <div class="card">
              <h3>Cheapest Configuration</h3>
              <p><strong>Strategy:</strong> ${cheapestCombination.searchStrategy}</p>
              <p><strong>LLM:</strong> ${cheapestCombination.llmModel}</p>
              <p><strong>Embedding:</strong> ${cheapestCombination.embeddingModel}</p>
              <p><strong>Content Type:</strong> ${cheapestCombination.contentType}</p>
              <p><strong>Total Cost:</strong> $${cheapestCombination.metrics.totalCost.toFixed(6)}</p>
              <p><strong>LLM Cost:</strong> $${cheapestCombination.metrics.llmCost.toFixed(6)}</p>
              <p><strong>Embedding Cost:</strong> $${cheapestCombination.metrics.embeddingCost.toFixed(6)}</p>
            </div>
            
            <div class="card">
              <h3>Most Accurate Configuration</h3>
              <p><strong>Strategy:</strong> ${mostAccurateCombination.searchStrategy}</p>
              <p><strong>LLM:</strong> ${mostAccurateCombination.llmModel}</p>
              <p><strong>Embedding:</strong> ${mostAccurateCombination.embeddingModel}</p>
              <p><strong>Content Type:</strong> ${mostAccurateCombination.contentType}</p>
              <p><strong>Keyword Match:</strong> ${mostAccurateCombination.metrics.keywordMatchPercentage.toFixed(2)}%</p>
            </div>
          </div>
          
          <div class="tabs">
            <div class="tab active" id="tab-overview">Overview</div>
            <div class="tab" id="tab-combinations">All Combinations</div>
            <div class="tab" id="tab-strategies">Search Strategies</div>
            <div class="tab" id="tab-models">Model Comparison</div>
            <div class="tab" id="tab-content">Content Types</div>
            <div class="tab" id="tab-context">Context Sizes</div>
            <div class="tab" id="tab-runs">Benchmark Runs</div>
            <div class="tab" id="tab-details">Detailed Results</div>
          </div>
          
          <div id="overview" class="tab-content active">
            <h2>Performance Overview</h2>
            
            <h3>Performance by Search Strategy</h3>
            <div class="chart">
              ${Object.entries(strategyAverages)
                .sort((a, b) => a[1].searchTime - b[1].searchTime)
                .map(([strategy, avg]) => {
                  const width = Math.min(100, (avg.searchTime / 1000) * 100);
                  return `
                    <div class="chart-bar" style="width: ${width}%">
                      <span class="chart-label">${strategy}</span>
                      <span class="chart-value">${avg.searchTime.toFixed(2)}ms</span>
                    </div>
                  `;
                })
                .join('')}
            </div>
            
            <h3>Overall Performance by Combination</h3>
            <div class="chart">
              ${weightedCombinations
                .sort((a, b) => b.scores.weightedScore - a.scores.weightedScore)
                .slice(0, 10) // Show top 10 combinations
                .map(c => {
                  const width = (c.scores.weightedScore * 100).toFixed(2);
                  return `
                    <div class="chart-bar" style="width: ${width}%">
                      <span class="chart-label">${c.searchStrategy} + ${c.llmModel} + ${c.embeddingModel} + ${c.contentType}</span>
                      <span class="chart-value">${width}%</span>
                    </div>
                  `;
                })
                .join('')}
            </div>
            
            <h3>Response Time Comparison</h3>
            <table>
              <tr>
                <th>LLM Model</th>
                <th>Avg Response Time (ms)</th>
              </tr>
              ${Object.entries(llmAverages)
                .sort((a, b) => a[1].llmResponseTime - b[1].llmResponseTime)
                .map(([model, avg]) => `
                  <tr>
                    <td>${model}</td>
                    <td>${avg.llmResponseTime.toFixed(2)}</td>
                  </tr>
                `)
                .join('')}
            </table>
            
            <h3>Cost Comparison</h3>
            <table>
              <tr>
                <th>LLM Model</th>
                <th>Avg Cost ($)</th>
              </tr>
              ${Object.entries(llmAverages)
                .sort((a, b) => a[1].llmCost - b[1].llmCost)
                .map(([model, avg]) => `
                  <tr>
                    <td>${model}</td>
                    <td>${avg.llmCost.toFixed(6)}</td>
                  </tr>
                `)
                .join('')}
            </table>
            
            <h3>Accuracy Comparison</h3>
            <table>
              <tr>
                <th>LLM Model</th>
                <th>Avg Keyword Match (%)</th>
              </tr>
              ${Object.entries(llmAverages)
                .sort((a, b) => b[1].keywordMatchPercentage - a[1].keywordMatchPercentage)
                .map(([model, avg]) => `
                  <tr>
                    <td>${model}</td>
                    <td>${avg.keywordMatchPercentage.toFixed(2)}</td>
                  </tr>
                `)
                .join('')}
            </table>
          </div>
          
          <div id="combinations" class="tab-content">
            <h2>All Combinations</h2>
            
            <table>
              <tr>
                <th>Search Strategy</th>
                <th>LLM Model</th>
                <th>Embedding Model</th>
                <th>Content Type</th>
                <th>Total Time (ms)</th>
                <th>Total Cost ($)</th>
                <th>Accuracy (%)</th>
                <th>Overall Score</th>
                <th>Sample Count</th>
              </tr>
              ${weightedCombinations
                .sort((a, b) => b.scores.weightedScore - a.scores.weightedScore)
                .map(combination => `
                  <tr class="${combination.combinationKey === bestOverallCombination.combinationKey ? 'highlight' : ''}">
                    <td>${combination.searchStrategy}</td>
                    <td>${combination.llmModel}</td>
                    <td>${combination.embeddingModel}</td>
                    <td>${combination.contentType}</td>
                    <td>${combination.metrics.totalTime.toFixed(2)}</td>
                    <td>${combination.metrics.totalCost.toFixed(6)}</td>
                    <td>${combination.metrics.keywordMatchPercentage.toFixed(2)}</td>
                    <td>${(combination.scores.weightedScore * 100).toFixed(2)}%</td>
                    <td>${combination.count}</td>
                  </tr>
                `)
                .join('')}
            </table>
          </div>
          
          <div id="strategies" class="tab-content">
            <h2>Search Strategy Comparison</h2>
            
            <h3>Search Strategies</h3>
            <table>
              <tr>
                <th>Strategy</th>
                <th>Avg Search Time (ms)</th>
                <th>Avg Keyword Match (%)</th>
                <th>Count</th>
              </tr>
              ${Object.entries(strategyAverages).map(([strategy, avg]) => `
                <tr>
                  <td>${strategy}</td>
                  <td>${avg.searchTime.toFixed(2)}</td>
                  <td>${avg.keywordMatchPercentage.toFixed(2)}</td>
                  <td>${avg.count}</td>
                </tr>
              `).join('')}
            </table>
            
            <h3>Strategy Performance by Content Type</h3>
            <table>
              <tr>
                <th>Strategy</th>
                <th>Content Type</th>
                <th>Avg Search Time (ms)</th>
                <th>Avg Keyword Match (%)</th>
              </tr>
              ${Object.entries(byStrategy).flatMap(([strategy, items]) => {
                const byContent = groupBy(items, 'content_type');
                return Object.entries(byContent).map(([contentType, contentItems]) => {
                  const avgTime = average(contentItems.map(item => item.metrics.searchTime));
                  const avgKeywords = average(contentItems.map(item => item.metrics.keywordMatchPercentage));
                  return `
                    <tr>
                      <td>${strategy}</td>
                      <td>${contentType}</td>
                      <td>${avgTime.toFixed(2)}</td>
                      <td>${avgKeywords.toFixed(2)}</td>
                    </tr>
                  `;
                });
              }).join('')}
            </table>
          </div>
          
          <div id="models" class="tab-content">
            <h2>Model Comparison</h2>
            
            <h3>LLM Models</h3>
            <table>
              <tr>
                <th>Model</th>
                <th>Avg Response Time (ms)</th>
                <th>Avg Cost ($)</th>
                <th>Avg Keyword Match (%)</th>
                <th>Count</th>
              </tr>
              ${Object.entries(llmAverages).map(([model, avg]) => `
                <tr>
                  <td>${model}</td>
                  <td>${avg.llmResponseTime.toFixed(2)}</td>
                  <td>${avg.llmCost.toFixed(6)}</td>
                  <td>${avg.keywordMatchPercentage.toFixed(2)}</td>
                  <td>${avg.count}</td>
                </tr>
              `).join('')}
            </table>
            
            <h3>Embedding Models</h3>
            <table>
              <tr>
                <th>Model</th>
                <th>Avg Search Time (ms)</th>
                <th>Avg Cost ($)</th>
                <th>Count</th>
              </tr>
              ${Object.entries(embeddingAverages).map(([model, avg]) => `
                <tr>
                  <td>${model}</td>
                  <td>${avg.searchTime ? avg.searchTime.toFixed(2) : avg.vectorSearchTime ? avg.vectorSearchTime.toFixed(2) : "N/A"}</td>
                  <td>${avg.embeddingCost.toFixed(6)}</td>
                  <td>${avg.count}</td>
                </tr>
              `).join('')}
            </table>
          </div>
          
          <div id="content" class="tab-content">
            <h2>Content Type Comparison</h2>
            
            <table>
              <tr>
                <th>Type</th>
                <th>Avg Total Time (ms)</th>
                <th>Avg Keyword Match (%)</th>
                <th>Count</th>
              </tr>
              ${Object.entries(contentTypeAverages).map(([type, avg]) => `
                <tr>
                  <td>${type}</td>
                  <td>${avg.totalTime.toFixed(2)}</td>
                  <td>${avg.keywordMatchPercentage.toFixed(2)}</td>
                  <td>${avg.count}</td>
                </tr>
              `).join('')}
            </table>
          </div>
          
          <div id="context" class="tab-content">
            <h2>Context Size Comparison</h2>
            
            <table>
              <tr>
                <th>Context Size</th>
                <th>Avg LLM Response Time (ms)</th>
                <th>Avg Context Tokens</th>
                <th>Avg Keyword Match (%)</th>
                <th>Count</th>
              </tr>
              ${Object.entries(contextSizeAverages).map(([size, avg]) => `
                <tr>
                  <td>${size}</td>
                  <td>${avg.llmResponseTime.toFixed(2)}</td>
                  <td>${avg.contextTokens.toFixed(0)}</td>
                  <td>${avg.keywordMatchPercentage.toFixed(2)}</td>
                  <td>${avg.count}</td>
                </tr>
              `).join('')}
            </table>
            
            <h3>Context Size Impact on Accuracy</h3>
            <div class="chart">
              ${Object.entries(contextSizeAverages)
                .sort((a, b) => b[1].keywordMatchPercentage - a[1].keywordMatchPercentage)
                .map(([size, avg]) => {
                  const width = Math.min(100, avg.keywordMatchPercentage);
                  return `
                    <div class="chart-bar" style="width: ${width}%">
                      <span class="chart-label">${size}</span>
                      <span class="chart-value">${avg.keywordMatchPercentage.toFixed(2)}%</span>
                    </div>
                  `;
                })
                .join('')}
            </div>
            
            <h3>Context Size Impact on Response Time</h3>
            <div class="chart">
              ${Object.entries(contextSizeAverages)
                .sort((a, b) => a[1].llmResponseTime - b[1].llmResponseTime)
                .map(([size, avg]) => {
                  const width = Math.min(100, (avg.llmResponseTime / 5000) * 100);
                  return `
                    <div class="chart-bar" style="width: ${width}%">
                      <span class="chart-label">${size}</span>
                      <span class="chart-value">${avg.llmResponseTime.toFixed(2)}ms</span>
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>
          
          <div id="runs" class="tab-content">
            <h2>Benchmark Runs Comparison</h2>
            
            <table>
              <tr>
                <th>Run ID</th>
                <th>Avg Total Time (ms)</th>
                <th>Avg LLM Response Time (ms)</th>
                <th>Avg Search Time (ms)</th>
                <th>Avg Keyword Match (%)</th>
                <th>Count</th>
              </tr>
              ${Object.entries(runAverages).map(([runId, avg]) => `
                <tr>
                  <td>${runId}</td>
                  <td>${avg.totalTime.toFixed(2)}</td>
                  <td>${avg.llmResponseTime.toFixed(2)}</td>
                  <td>${avg.searchTime.toFixed(2)}</td>
                  <td>${avg.keywordMatchPercentage.toFixed(2)}</td>
                  <td>${avg.count}</td>
                </tr>
              `).join('')}
            </table>
          </div>
          
          <div id="details" class="tab-content">
            <h2>Detailed Results</h2>
            
            <table>
              <tr>
                <th>Run ID</th>
                <th>Query</th>
                <th>Response</th>
                <th>Search Strategy</th>
                <th>LLM Model</th>
                <th>Embedding Model</th>
                <th>Content Type</th>
                <th>Context Size</th>
                <th>Total Time (ms)</th>
                <th>Total Cost ($)</th>
                <th>Keyword Match (%)</th>
              </tr>
              ${successfulResults
                .sort((a, b) => a.query_text.localeCompare(b.query_text))
                .map(result => {
                  const response = result.response_text || '';
                  const expectedKeywords = result.expected_keywords || [];
                  const keywordsMatched = result.metrics.keywordsMatched || 0;
                  
                  // Highlight keywords in response
                  let highlightedResponse = response;
                  if (expectedKeywords.length > 0) {
                    // Create a safe HTML version
                    highlightedResponse = response.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    
                    // Highlight keywords
                    expectedKeywords.forEach(keyword => {
                      if (keyword) {
                        const regex = new RegExp(keyword, 'gi');
                        highlightedResponse = highlightedResponse.replace(regex, match => 
                          '<span style="background-color: #e6ffe6; padding: 2px 4px; border-radius: 3px;">' + match + '</span>'
                        );
                      }
                    });
                  }
                  
                  return `
                  <tr>
                    <td>${result.run_id}</td>
                    <td>${result.query_text}</td>
                    <td style="max-width: 400px; overflow: auto; white-space: pre-wrap;">${highlightedResponse}</td>
                    <td>${result.search_strategy || 'vector-search'}</td>
                    <td>${result.llm_model}</td>
                    <td>${result.embedding_model}</td>
                    <td>${result.content_type}</td>
                    <td>${result.combination && result.combination.contextSize 
                        ? result.combination.contextSize 
                        : result.combination && result.combination.topK 
                          ? `topK-${result.combination.topK}` 
                          : result.retrieved_document_ids 
                            ? `topK-${result.retrieved_document_ids.length}` 
                            : 'unknown'}</td>
                    <td>${result.metrics.totalTime.toFixed(2)}</td>
                    <td>${result.metrics.totalCost.toFixed(6)}</td>
                    <td>${result.metrics.keywordMatchPercentage.toFixed(2)} ${keywordsMatched ? `(${keywordsMatched}/${expectedKeywords.length})` : ''}</td>
                  </tr>
                `}).join('')}
            </table>
          </div>
        </div>
        
        <script>
          // Tab functionality
          document.addEventListener('DOMContentLoaded', function() {
            const tabs = document.querySelectorAll('.tab');
            const tabContents = document.querySelectorAll('.tab-content');
            
            tabs.forEach(tab => {
              tab.addEventListener('click', function() {
                // Remove active class from all tabs
                tabs.forEach(t => t.classList.remove('active'));
                
                // Add active class to clicked tab
                this.classList.add('active');
                
                // Get the tab ID
                const tabId = this.id.replace('tab-', '');
                
                // Hide all tab contents
                tabContents.forEach(content => {
                  content.classList.remove('active');
                });
                
                // Show the selected tab content
                document.getElementById(tabId).classList.add('active');
              });
            });
          });
        </script>
      </body>
    </html>
  `;
}

/**
 * Calculate averages for grouped results
 */
function calculateAverages(groupedResults, groupKey) {
  const averages = {};
  
  for (const [key, items] of Object.entries(groupedResults)) {
    const metrics = {
      count: items.length,
      totalTime: average(items.map(item => item.metrics.totalTime)),
      llmResponseTime: average(items.map(item => item.metrics.llmResponseTime)),
      vectorSearchTime: average(items.map(item => item.metrics.vectorSearchTime || 0)),
      searchTime: average(items.map(item => item.metrics.searchTime || item.metrics.vectorSearchTime || 0)),
      embeddingTime: average(items.map(item => item.metrics.embeddingTime)),
      embeddingCost: average(items.map(item => item.metrics.embeddingCost)),
      llmCost: average(items.map(item => item.metrics.llmCost)),
      totalCost: average(items.map(item => item.metrics.totalCost)),
      keywordMatchPercentage: average(items.map(item => item.metrics.keywordMatchPercentage))
    };
    
    averages[key] = metrics;
  }
  
  return averages;
}

/**
 * Helper function to group array by property
 */
function groupBy(array, key) {
  return array.reduce((result, item) => {
    const keyValue = typeof key === 'function' ? key(item) : item[key];
    (result[keyValue] = result[keyValue] || []).push(item);
    return result;
  }, {});
}

/**
 * Helper function to calculate average
 */
function average(array) {
  if (array.length === 0) return 0;
  return array.reduce((sum, value) => sum + value, 0) / array.length;
}

// Run the main function
main().catch(console.error);
