/**
 * Hybrid Search Strategy for RAG
 * 
 * This module implements hybrid search retrieval for RAG, combining vector search
 * with keyword/lexical search for better results.
 */

import { Pool } from 'pg';

/**
 * HybridSearchStrategy class
 */
export class HybridSearchStrategy {
  /**
   * Constructor
   * @param {Object} dbConfig - Database configuration
   */
  constructor(dbConfig) {
    this.pool = new Pool(dbConfig);
    this.name = 'hybrid-search';
  }

  /**
   * Perform hybrid search (vector + keyword)
   * @param {Array} embedding - Query embedding vector
   * @param {String} queryText - Original query text for keyword search
   * @param {String} embeddingModel - Embedding model used
   * @param {String} contentType - Content type to search
   * @param {Number} topK - Number of results to return
   * @param {Number} dimension - Embedding dimension
   * @param {Object} options - Additional options
   * @param {Number} options.vectorWeight - Weight for vector search (default: 0.7)
   * @param {Number} options.keywordWeight - Weight for keyword search (default: 0.3)
   * @returns {Array} Search results
   */
  async search(embedding, queryText, embeddingModel, contentType, topK, dimension, options = {}) {
    // Set default weights
    const vectorWeight = options.vectorWeight || 0.7;
    const keywordWeight = options.keywordWeight || 0.3;
    
    // Determine which table to use based on dimension
    const tableName = `documents_${dimension}`;
    
    // Format embedding for PostgreSQL
    const embeddingStr = JSON.stringify(embedding);
    
    // Prepare query keywords
    const keywords = this.extractKeywords(queryText);
    const keywordPattern = keywords.join(' | ');
    
    // Build hybrid query combining vector similarity with text search
    const query = `
      WITH vector_results AS (
        SELECT 
          id,
          content,
          content_type,
          metadata,
          xeto_spec_name,
          xeto_library,
          1 - (embedding <=> $1::vector) AS vector_similarity
        FROM ${tableName}
        WHERE content_type = $2
        ORDER BY embedding <=> $1::vector
        LIMIT $3 * 2
      ),
      keyword_results AS (
        SELECT 
          id,
          content,
          content_type,
          metadata,
          xeto_spec_name,
          xeto_library,
          ts_rank_cd(to_tsvector('english', content), to_tsquery('english', $4)) AS keyword_similarity
        FROM ${tableName}
        WHERE 
          content_type = $2 AND
          to_tsvector('english', content) @@ to_tsquery('english', $4)
        ORDER BY keyword_similarity DESC
        LIMIT $3 * 2
      ),
      combined_results AS (
        SELECT 
          COALESCE(v.id, k.id) AS id,
          COALESCE(v.content, k.content) AS content,
          COALESCE(v.content_type, k.content_type) AS content_type,
          COALESCE(v.metadata, k.metadata) AS metadata,
          COALESCE(v.xeto_spec_name, k.xeto_spec_name) AS xeto_spec_name,
          COALESCE(v.xeto_library, k.xeto_library) AS xeto_library,
          COALESCE(v.vector_similarity, 0) * $5 AS weighted_vector_similarity,
          COALESCE(k.keyword_similarity, 0) * $6 AS weighted_keyword_similarity,
          (COALESCE(v.vector_similarity, 0) * $5) + (COALESCE(k.keyword_similarity, 0) * $6) AS combined_score
        FROM vector_results v
        FULL OUTER JOIN keyword_results k ON v.id = k.id
      )
      SELECT 
        id,
        content,
        content_type,
        metadata,
        xeto_spec_name,
        xeto_library,
        weighted_vector_similarity / $5 AS vector_similarity,
        weighted_keyword_similarity / $6 AS keyword_similarity,
        combined_score AS similarity
      FROM combined_results
      ORDER BY combined_score DESC
      LIMIT $3
    `;
    
    const result = await this.pool.query(query, [
      embeddingStr, 
      contentType, 
      topK, 
      keywordPattern,
      vectorWeight,
      keywordWeight
    ]);
    
    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      contentType: row.content_type,
      metadata: row.metadata,
      xetoSpecName: row.xeto_spec_name,
      xetoLibrary: row.xeto_library,
      vectorSimilarity: parseFloat(row.vector_similarity || 0),
      keywordSimilarity: parseFloat(row.keyword_similarity || 0),
      similarity: parseFloat(row.similarity || 0)
    }));
  }

  /**
   * Extract keywords from query text
   * @param {String} queryText - Query text
   * @returns {Array} Array of keywords
   */
  extractKeywords(queryText) {
    // Remove common stop words
    const stopWords = ['a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'in', 'on', 'at', 'to', 'for', 'with'];
    
    // Split query into words, convert to lowercase, and filter out stop words
    const words = queryText.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));
    
    // Return unique keywords
    return [...new Set(words)];
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

/**
 * Create a new hybrid search strategy
 * @param {Object} dbConfig - Database configuration
 * @returns {HybridSearchStrategy} Hybrid search strategy instance
 */
export function createHybridSearchStrategy(dbConfig) {
  return new HybridSearchStrategy(dbConfig);
}

export default createHybridSearchStrategy;
