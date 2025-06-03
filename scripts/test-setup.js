#!/usr/bin/env node

/**
 * RAG Benchmarking Tool Setup Test
 * 
 * This script tests the setup of the RAG benchmarking tool by:
 * 1. Checking database connection
 * 2. Verifying pgvector extension
 * 3. Testing API connections
 * 4. Validating database schema
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { OpenAI } from 'openai';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';

// Initialize clients
let openai;
let genAI;
let pool;

// Database configuration
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

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

/**
 * Main function
 */
async function main() {
  console.log('🔍 RAG Benchmarking Tool Setup Test');
  console.log('==================================\n');
  
  let success = true;
  
  try {
    // Step 1: Check environment variables
    console.log('1️⃣ Checking environment variables...');
    success = success && await checkEnvironmentVariables();
    
    // Step 2: Test database connection
    console.log('\n2️⃣ Testing database connection...');
    success = success && await testDatabaseConnection();
    
    // Step 3: Check pgvector extension
    console.log('\n3️⃣ Checking pgvector extension...');
    success = success && await checkPgvectorExtension();
    
    // Step 4: Validate database schema
    console.log('\n4️⃣ Validating database schema...');
    success = success && await validateDatabaseSchema();
    
    // Step 5: Test OpenAI API connection
    console.log('\n5️⃣ Testing OpenAI API connection...');
    success = success && await testOpenAIConnection();
    
    // Step 6: Test Gemini API connection
    console.log('\n6️⃣ Testing Gemini API connection...');
    success = success && await testGeminiConnection();
    
    // Step 7: Test vector search
    console.log('\n7️⃣ Testing vector search...');
    success = success && await testVectorSearch();
    
    // Final result
    console.log('\n==================================');
    if (success) {
      console.log('✅ All tests passed! Your setup is ready for benchmarking.');
      console.log('\nYou can now run:');
      console.log('  npm run benchmark');
      console.log('  or');
      console.log('  node run-benchmark.js');
    } else {
      console.log('❌ Some tests failed. Please fix the issues before running benchmarks.');
    }
    
  } catch (error) {
    console.error(`\n❌ Setup test failed with error: ${error.message}`);
    console.error(error);
    success = false;
  } finally {
    // Close connections
    if (pool) {
      await pool.end();
    }
  }
  
  return success;
}

/**
 * Check environment variables
 */
async function checkEnvironmentVariables() {
  let success = true;
  
  // Check API keys
  if (!process.env.OPENAI_API_KEY) {
    console.log('❌ OPENAI_API_KEY is missing in .env file');
    success = false;
  } else {
    console.log('✅ OPENAI_API_KEY found');
  }
  
  if (!process.env.GEMINI_API_KEY) {
    console.log('❌ GEMINI_API_KEY is missing in .env file');
    success = false;
  } else {
    console.log('✅ GEMINI_API_KEY found');
  }
  
  // Check database URL
  if (!process.env.DATABASE_URL) {
    console.log('❌ DATABASE_URL is missing in .env file');
    success = false;
  } else {
    console.log('✅ DATABASE_URL found');
  }
  
  // Check model configurations
  const missingModels = [];
  
  for (const category of Object.keys(MODELS)) {
    for (const [key, value] of Object.entries(MODELS[category])) {
      if (!value) {
        missingModels.push(`${category}.${key}`);
      }
    }
  }
  
  if (missingModels.length > 0) {
    console.log(`❌ Missing model configurations: ${missingModels.join(', ')}`);
    success = false;
  } else {
    console.log('✅ All model configurations found');
  }
  
  return success;
}

/**
 * Test database connection
 */
async function testDatabaseConnection() {
  try {
    pool = new Pool(dbConfig);
    
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    
    console.log('✅ Successfully connected to PostgreSQL database');
    console.log(`   Database time: ${result.rows[0].now}`);
    return true;
  } catch (error) {
    console.log(`❌ Failed to connect to database: ${error.message}`);
    return false;
  }
}

/**
 * Check pgvector extension
 */
async function checkPgvectorExtension() {
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
    );
    client.release();
    
    const isInstalled = result.rows[0].exists;
    
    if (isInstalled) {
      console.log('✅ pgvector extension is installed');
      return true;
    } else {
      console.log('❌ pgvector extension is not installed');
      console.log('   You need to install pgvector extension in your PostgreSQL database:');
      console.log('   CREATE EXTENSION IF NOT EXISTS vector;');
      return false;
    }
  } catch (error) {
    console.log(`❌ Error checking pgvector extension: ${error.message}`);
    return false;
  }
}

/**
 * Validate database schema
 */
async function validateDatabaseSchema() {
  try {
    const client = await pool.connect();
    
    // Check required tables
    const requiredTables = [
      'documents_1536',
      'documents_3072',
      'documents_768',
      'benchmark_results',
      'test_queries',
      'performance_metrics'
    ];
    
    let allTablesExist = true;
    
    for (const table of requiredTables) {
      const result = await client.query(
        `SELECT EXISTS(
          SELECT 1 FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        )`,
        [table]
      );
      
      const exists = result.rows[0].exists;
      
      if (!exists) {
        console.log(`❌ Table '${table}' does not exist`);
        allTablesExist = false;
      }
    }
    
    if (allTablesExist) {
      console.log('✅ All required tables exist');
    }
    
    // Check if there's data in the tables
    const dataResults = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM documents_1536) as count_1536,
        (SELECT COUNT(*) FROM documents_3072) as count_3072,
        (SELECT COUNT(*) FROM documents_768) as count_768,
        (SELECT COUNT(*) FROM test_queries) as count_queries
    `);
    
    const counts = dataResults.rows[0];
    
    console.log(`   documents_1536: ${counts.count_1536} records`);
    console.log(`   documents_3072: ${counts.count_3072} records`);
    console.log(`   documents_768: ${counts.count_768} records`);
    console.log(`   test_queries: ${counts.count_queries} records`);
    
    if (counts.count_1536 === '0' && counts.count_3072 === '0' && counts.count_768 === '0') {
      console.log('⚠️  Warning: No documents found in any of the document tables');
    }
    
    if (counts.count_queries === '0') {
      console.log('⚠️  Warning: No test queries found');
    }
    
    client.release();
    return allTablesExist;
  } catch (error) {
    console.log(`❌ Error validating database schema: ${error.message}`);
    return false;
  }
}

/**
 * Test OpenAI API connection
 */
async function testOpenAIConnection() {
  try {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Test embedding generation
    const embeddingResponse = await openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_SMALL,
      input: 'This is a test',
      encoding_format: 'float'
    });
    
    if (embeddingResponse.data && embeddingResponse.data.length > 0) {
      const embedding = embeddingResponse.data[0].embedding;
      console.log(`✅ Successfully generated OpenAI embedding (${embedding.length} dimensions)`);
      return true;
    } else {
      console.log('❌ Failed to generate OpenAI embedding: Unexpected response format');
      return false;
    }
  } catch (error) {
    console.log(`❌ Failed to connect to OpenAI API: ${error.message}`);
    return false;
  }
}

/**
 * Test Gemini API connection
 */
async function testGeminiConnection() {
  try {
    // Using the correct API format as per the documentation
    genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    console.log(`ℹ️ Testing Gemini API connection with the correct API format...`);
    
    // Using the correct API format
    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: "Hello, world!",
    });
    
    console.log(`✅ Successfully connected to Gemini API`);
    console.log(`   Response: "${response.text.substring(0, 50)}${response.text.length > 50 ? '...' : ''}"`);
    return true;
  } catch (error) {
    console.log(`❌ Failed to connect to Gemini API: ${error.message}`);
    console.log(`   This might be due to an invalid API key or network issues.`);
    console.log(`   You can still run benchmarks with OpenAI models only.`);
    return false;
  }
}

/**
 * Test vector search
 */
async function testVectorSearch() {
  try {
    const client = await pool.connect();
    
    // Generate a test embedding
    const embeddingResponse = await openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_SMALL,
      input: 'What is a temperature sensor?',
      encoding_format: 'float'
    });
    
    const embedding = embeddingResponse.data[0].embedding;
    
    // Perform vector search
    const query = `
      SELECT 
        id,
        content_type,
        LEFT(content, 50) as content_preview,
        1 - (embedding <=> $1::vector) AS similarity
      FROM documents_1536
      ORDER BY embedding <=> $1::vector
      LIMIT 3
    `;
    
    const result = await client.query(query, [JSON.stringify(embedding)]);
    client.release();
    
    if (result.rows.length > 0) {
      console.log(`✅ Successfully performed vector search`);
      console.log(`   Found ${result.rows.length} results:`);
      
      for (const row of result.rows) {
        console.log(`   - ${row.content_preview}... (similarity: ${row.similarity.toFixed(4)})`);
      }
      
      return true;
    } else {
      console.log('⚠️  Vector search returned no results. This might be normal if your database is empty.');
      return true;
    }
  } catch (error) {
    console.log(`❌ Failed to perform vector search: ${error.message}`);
    return false;
  }
}

// Run the main function
main()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
