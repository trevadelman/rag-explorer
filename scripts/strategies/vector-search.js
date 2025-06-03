/**
 * Vector Search Strategy for RAG
 * 
 * This module implements vector search retrieval for RAG using PostgreSQL with pgvector.
 */

import { Pool } from 'pg';

/**
 * VectorSearchStrategy class
 */
export class VectorSearchStrategy {
  /**
   * Constructor
   * @param {Object} dbConfig - Database configuration
   */
  constructor(dbConfig) {
    this.pool = new Pool(dbConfig);
    this.name = 'vector-search';
  }

  /**
   * Perform vector search
   * @param {Array} embedding - Query embedding vector
   * @param {String} embeddingModel - Embedding model used
   * @param {String} contentType - Content type to search
   * @param {Number} topK - Number of results to return
   * @param {Number} dimension - Embedding dimension
   * @returns {Array} Search results
   */
  async search(embedding, embeddingModel, contentType, topK, dimension) {
    // Determine which table to use based on dimension
    const tableName = `documents_${dimension}`;
    
    // Format embedding for PostgreSQL
    const embeddingStr = JSON.stringify(embedding);
    
    // Build provider prefix
    const providerPrefix = embeddingModel.includes('text-embedding-3') ? 'openai_' : 'gemini_';
    
    // Build query
    const query = `
      SELECT 
        id,
        content,
        content_type,
        metadata,
        xeto_spec_name,
        xeto_library,
        1 - (embedding <=> $1::vector) AS similarity
      FROM ${tableName}
      WHERE content_type = $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `;
    
    const result = await this.pool.query(query, [embeddingStr, contentType, topK]);
    
    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      contentType: row.content_type,
      metadata: row.metadata,
      xetoSpecName: row.xeto_spec_name,
      xetoLibrary: row.xeto_library,
      similarity: parseFloat(row.similarity)
    }));
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

/**
 * Create a new vector search strategy
 * @param {Object} dbConfig - Database configuration
 * @returns {VectorSearchStrategy} Vector search strategy instance
 */
export function createVectorSearchStrategy(dbConfig) {
  return new VectorSearchStrategy(dbConfig);
}

export default createVectorSearchStrategy;
