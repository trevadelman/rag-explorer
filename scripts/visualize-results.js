#!/usr/bin/env node

/**
 * RAG Benchmark Visualization Tool
 * 
 * This script generates visualizations from benchmark results to help
 * analyze and compare different RAG configurations.
 */

import fs from 'fs/promises';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default input file
const DEFAULT_INPUT_FILE = 'results/benchmark-results.json';

// Parse command line arguments
const args = process.argv.slice(2);
const inputFile = args[0] || DEFAULT_INPUT_FILE;

/**
 * Main function
 */
async function main() {
  try {
    console.log(`Reading benchmark results from ${inputFile}...`);
    
    // Read benchmark results
    const data = await fs.readFile(inputFile, 'utf8');
    const benchmarkResults = JSON.parse(data);
    
    // Generate HTML report
    const htmlReport = generateHtmlReport(benchmarkResults);
    
    // Create results directory if it doesn't exist
    const outputDir = path.dirname(inputFile);
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (err) {
      // Directory already exists, ignore
    }
    
    // Save HTML report
    const outputFile = inputFile.replace('.json', '-report.html');
    await fs.writeFile(outputFile, htmlReport);
    
    console.log(`Report generated: ${outputFile}`);
    
    // Start HTTP server to view the report
    const port = 3000;
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
function generateHtmlReport(benchmarkResults) {
  const { results, timestamp } = benchmarkResults;
  
  // Filter out failed results
  const successfulResults = results.filter(r => r.success);
  
  if (successfulResults.length === 0) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>RAG Benchmark Results</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
          </style>
        </head>
        <body>
          <h1>RAG Benchmark Results</h1>
          <p>No successful benchmark results found.</p>
        </body>
      </html>
    `;
  }
  
  // Group results
  const byLLM = groupBy(successfulResults, 'llm_model');
  const byEmbedding = groupBy(successfulResults, 'embedding_model');
  const byContentType = groupBy(successfulResults, 'content_type');
  
  // Calculate averages
  const llmAverages = calculateAverages(byLLM, 'llm_model');
  const embeddingAverages = calculateAverages(byEmbedding, 'embedding_model');
  const contentTypeAverages = calculateAverages(byContentType, 'content_type');
  
  // Find best combinations
  const fastestResult = successfulResults.sort((a, b) => a.metrics.totalTime - b.metrics.totalTime)[0];
  const cheapestResult = successfulResults.sort((a, b) => a.metrics.totalCost - b.metrics.totalCost)[0];
  const mostAccurateResult = successfulResults.sort((a, b) => b.metrics.keywordMatchPercentage - a.metrics.keywordMatchPercentage)[0];
  
  // Generate HTML
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>RAG Benchmark Results</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
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
          .chart-container {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            margin-bottom: 30px;
          }
          .chart {
            background-color: white;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            padding: 15px;
            margin-bottom: 20px;
            width: 48%;
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
          @media (max-width: 768px) {
            .chart {
              width: 100%;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>RAG Benchmark Results</h1>
          <p>Generated on: ${new Date(timestamp).toLocaleString()}</p>
          <p>Total benchmarks: ${successfulResults.length}</p>
          
          <h2>Best Configurations</h2>
          <div class="summary-cards">
            <div class="card">
              <h3>Fastest Configuration</h3>
              <p><strong>LLM:</strong> ${fastestResult.llm_model}</p>
              <p><strong>Embedding:</strong> ${fastestResult.embedding_model}</p>
              <p><strong>Content Type:</strong> ${fastestResult.content_type}</p>
              <p><strong>Total Time:</strong> ${fastestResult.metrics.totalTime.toFixed(2)}ms</p>
            </div>
            
            <div class="card">
              <h3>Cheapest Configuration</h3>
              <p><strong>LLM:</strong> ${cheapestResult.llm_model}</p>
              <p><strong>Embedding:</strong> ${cheapestResult.embedding_model}</p>
              <p><strong>Content Type:</strong> ${cheapestResult.content_type}</p>
              <p><strong>Total Cost:</strong> $${cheapestResult.metrics.totalCost.toFixed(6)}</p>
            </div>
            
            <div class="card">
              <h3>Most Accurate Configuration</h3>
              <p><strong>LLM:</strong> ${mostAccurateResult.llm_model}</p>
              <p><strong>Embedding:</strong> ${mostAccurateResult.embedding_model}</p>
              <p><strong>Content Type:</strong> ${mostAccurateResult.content_type}</p>
              <p><strong>Keyword Match:</strong> ${mostAccurateResult.metrics.keywordMatchPercentage.toFixed(2)}%</p>
            </div>
          </div>
          
          <h2>Performance Charts</h2>
          
          <div class="chart-container">
            <div class="chart">
              <h3>Response Time by LLM Model</h3>
              <canvas id="llmTimeChart"></canvas>
            </div>
            
            <div class="chart">
              <h3>Cost by LLM Model</h3>
              <canvas id="llmCostChart"></canvas>
            </div>
            
            <div class="chart">
              <h3>Vector Search Time by Embedding Model</h3>
              <canvas id="embeddingTimeChart"></canvas>
            </div>
            
            <div class="chart">
              <h3>Cost by Embedding Model</h3>
              <canvas id="embeddingCostChart"></canvas>
            </div>
            
            <div class="chart">
              <h3>Accuracy by Content Type</h3>
              <canvas id="contentAccuracyChart"></canvas>
            </div>
            
            <div class="chart">
              <h3>Total Time by Content Type</h3>
              <canvas id="contentTimeChart"></canvas>
            </div>
          </div>
          
          <h2>Detailed Results</h2>
          
          <h3>By LLM Model</h3>
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
          
          <h3>By Embedding Model</h3>
          <table>
            <tr>
              <th>Model</th>
              <th>Avg Vector Search Time (ms)</th>
              <th>Avg Cost ($)</th>
              <th>Count</th>
            </tr>
            ${Object.entries(embeddingAverages).map(([model, avg]) => `
              <tr>
                <td>${model}</td>
                <td>${avg.vectorSearchTime.toFixed(2)}</td>
                <td>${avg.embeddingCost.toFixed(6)}</td>
                <td>${avg.count}</td>
              </tr>
            `).join('')}
          </table>
          
          <h3>By Content Type</h3>
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
          
          <h3>All Results</h3>
          <table>
            <tr>
              <th>Query</th>
              <th>LLM Model</th>
              <th>Embedding Model</th>
              <th>Content Type</th>
              <th>Total Time (ms)</th>
              <th>Total Cost ($)</th>
              <th>Keyword Match (%)</th>
            </tr>
            ${successfulResults.map(result => `
              <tr>
                <td>${result.query_text.substring(0, 30)}...</td>
                <td>${result.llm_model}</td>
                <td>${result.embedding_model}</td>
                <td>${result.content_type}</td>
                <td>${result.metrics.totalTime.toFixed(2)}</td>
                <td>${result.metrics.totalCost.toFixed(6)}</td>
                <td>${result.metrics.keywordMatchPercentage.toFixed(2)}</td>
              </tr>
            `).join('')}
          </table>
        </div>
        
        <script>
          // Chart.js initialization
          document.addEventListener('DOMContentLoaded', function() {
            // LLM Response Time Chart
            new Chart(document.getElementById('llmTimeChart'), {
              type: 'bar',
              data: {
                labels: ${JSON.stringify(Object.keys(llmAverages))},
                datasets: [{
                  label: 'Avg Response Time (ms)',
                  data: ${JSON.stringify(Object.values(llmAverages).map(avg => avg.llmResponseTime))},
                  backgroundColor: 'rgba(54, 162, 235, 0.5)',
                  borderColor: 'rgba(54, 162, 235, 1)',
                  borderWidth: 1
                }]
              },
              options: {
                scales: {
                  y: {
                    beginAtZero: true
                  }
                }
              }
            });
            
            // LLM Cost Chart
            new Chart(document.getElementById('llmCostChart'), {
              type: 'bar',
              data: {
                labels: ${JSON.stringify(Object.keys(llmAverages))},
                datasets: [{
                  label: 'Avg Cost ($)',
                  data: ${JSON.stringify(Object.values(llmAverages).map(avg => avg.llmCost))},
                  backgroundColor: 'rgba(255, 99, 132, 0.5)',
                  borderColor: 'rgba(255, 99, 132, 1)',
                  borderWidth: 1
                }]
              },
              options: {
                scales: {
                  y: {
                    beginAtZero: true
                  }
                }
              }
            });
            
            // Embedding Time Chart
            new Chart(document.getElementById('embeddingTimeChart'), {
              type: 'bar',
              data: {
                labels: ${JSON.stringify(Object.keys(embeddingAverages))},
                datasets: [{
                  label: 'Avg Vector Search Time (ms)',
                  data: ${JSON.stringify(Object.values(embeddingAverages).map(avg => avg.vectorSearchTime))},
                  backgroundColor: 'rgba(75, 192, 192, 0.5)',
                  borderColor: 'rgba(75, 192, 192, 1)',
                  borderWidth: 1
                }]
              },
              options: {
                scales: {
                  y: {
                    beginAtZero: true
                  }
                }
              }
            });
            
            // Embedding Cost Chart
            new Chart(document.getElementById('embeddingCostChart'), {
              type: 'bar',
              data: {
                labels: ${JSON.stringify(Object.keys(embeddingAverages))},
                datasets: [{
                  label: 'Avg Cost ($)',
                  data: ${JSON.stringify(Object.values(embeddingAverages).map(avg => avg.embeddingCost))},
                  backgroundColor: 'rgba(153, 102, 255, 0.5)',
                  borderColor: 'rgba(153, 102, 255, 1)',
                  borderWidth: 1
                }]
              },
              options: {
                scales: {
                  y: {
                    beginAtZero: true
                  }
                }
              }
            });
            
            // Content Accuracy Chart
            new Chart(document.getElementById('contentAccuracyChart'), {
              type: 'bar',
              data: {
                labels: ${JSON.stringify(Object.keys(contentTypeAverages))},
                datasets: [{
                  label: 'Avg Keyword Match (%)',
                  data: ${JSON.stringify(Object.values(contentTypeAverages).map(avg => avg.keywordMatchPercentage))},
                  backgroundColor: 'rgba(255, 159, 64, 0.5)',
                  borderColor: 'rgba(255, 159, 64, 1)',
                  borderWidth: 1
                }]
              },
              options: {
                scales: {
                  y: {
                    beginAtZero: true,
                    max: 100
                  }
                }
              }
            });
            
            // Content Time Chart
            new Chart(document.getElementById('contentTimeChart'), {
              type: 'bar',
              data: {
                labels: ${JSON.stringify(Object.keys(contentTypeAverages))},
                datasets: [{
                  label: 'Avg Total Time (ms)',
                  data: ${JSON.stringify(Object.values(contentTypeAverages).map(avg => avg.totalTime))},
                  backgroundColor: 'rgba(201, 203, 207, 0.5)',
                  borderColor: 'rgba(201, 203, 207, 1)',
                  borderWidth: 1
                }]
              },
              options: {
                scales: {
                  y: {
                    beginAtZero: true
                  }
                }
              }
            });
          });
        </script>
      </body>
    </html>
  `;
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
 * Calculate averages for grouped results
 */
function calculateAverages(groupedResults, groupKey) {
  const averages = {};
  
  for (const [key, items] of Object.entries(groupedResults)) {
    const metrics = {
      count: items.length,
      totalTime: average(items.map(item => item.metrics.totalTime)),
      llmResponseTime: average(items.map(item => item.metrics.llmResponseTime)),
      vectorSearchTime: average(items.map(item => item.metrics.vectorSearchTime)),
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
 * Helper function to calculate average
 */
function average(array) {
  if (array.length === 0) return 0;
  return array.reduce((sum, value) => sum + value, 0) / array.length;
}

// Run the main function
main().catch(console.error);
