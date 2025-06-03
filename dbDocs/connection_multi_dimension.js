import 'dotenv/config';
import pg from 'pg';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

// Database configuration
const dbConfig = {
    connectionString: process.env.DATABASE_URL,
    max: 20, // Maximum number of connections in the pool
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection could not be established
};

// Create connection pool
let pool = null;

/**
 * Initialize database connection pool
 */
export function initializePool() {
    if (!pool) {
        pool = new Pool(dbConfig);
        
        // Handle pool errors
        pool.on('error', (err) => {
            console.error('Unexpected error on idle client', err);
            process.exit(-1);
        });
        
        console.log('Database connection pool initialized');
    }
    return pool;
}

/**
 * Get database connection pool
 */
export function getPool() {
    if (!pool) {
        return initializePool();
    }
    return pool;
}

/**
 * Test database connection
 */
export async function testConnection() {
    try {
        const client = await getPool().connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        console.log('✅ Database connection successful');
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
}

/**
 * Check if pgvector extension is installed
 */
export async function checkPgvectorExtension() {
    try {
        const client = await getPool().connect();
        const result = await client.query(
            "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
        );
        client.release();
        
        const isInstalled = result.rows[0].exists;
        if (isInstalled) {
            console.log('✅ pgvector extension is installed');
        } else {
            console.log('❌ pgvector extension is not installed');
        }
        return isInstalled;
    } catch (error) {
        console.error('❌ Error checking pgvector extension:', error.message);
        return false;
    }
}

/**
 * Install pgvector extension
 */
export async function installPgvectorExtension() {
    try {
        const client = await getPool().connect();
        await client.query('CREATE EXTENSION IF NOT EXISTS vector');
        client.release();
        console.log('✅ pgvector extension installed successfully');
        return true;
    } catch (error) {
        console.error('❌ Failed to install pgvector extension:', error.message);
        return false;
    }
}

/**
 * Initialize database schema with multi-dimension support
 */
export async function initializeMultiDimensionSchema() {
    try {
        const schemaPath = path.join(__dirname, 'schema_multi_dimension.sql');
        const schemaSql = await fs.readFile(schemaPath, 'utf8');
        
        const client = await getPool().connect();
        await client.query(schemaSql);
        client.release();
        
        console.log('✅ Multi-dimension database schema initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Failed to initialize multi-dimension database schema:', error.message);
        return false;
    }
}

/**
 * Initialize database schema
 */
export async function initializeSchema() {
    try {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = await fs.readFile(schemaPath, 'utf8');
        
        const client = await getPool().connect();
        await client.query(schemaSql);
        client.release();
        
        console.log('✅ Database schema initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Failed to initialize database schema:', error.message);
        return false;
    }
}

/**
 * Get database statistics for multi-dimension schema
 */
export async function getMultiDimensionDatabaseStats() {
    try {
        const client = await getPool().connect();
        
        const queries = [
            { name: 'documents_1536', query: 'SELECT COUNT(*) as count FROM documents_1536' },
            { name: 'documents_3072', query: 'SELECT COUNT(*) as count FROM documents_3072' },
            { name: 'documents_768', query: 'SELECT COUNT(*) as count FROM documents_768' },
            { name: 'benchmark_results', query: 'SELECT COUNT(*) as count FROM benchmark_results' },
            { name: 'test_queries', query: 'SELECT COUNT(*) as count FROM test_queries' },
            { name: 'performance_metrics', query: 'SELECT COUNT(*) as count FROM performance_metrics' }
        ];
        
        const stats = {};
        for (const { name, query } of queries) {
            try {
                const result = await client.query(query);
                stats[name] = parseInt(result.rows[0].count);
            } catch (error) {
                stats[name] = 0; // Table might not exist yet
            }
        }
        
        // Calculate total documents
        stats.documents = (stats.documents_1536 || 0) + (stats.documents_3072 || 0) + (stats.documents_768 || 0);
        
        // Get available models for each dimension
        try {
            const modelsQuery = `
                SELECT 'documents_1536' as table_name, embedding_model, content_type, COUNT(*) as count
                FROM documents_1536
                GROUP BY embedding_model, content_type
                UNION ALL
                SELECT 'documents_3072' as table_name, embedding_model, content_type, COUNT(*) as count
                FROM documents_3072
                GROUP BY embedding_model, content_type
                UNION ALL
                SELECT 'documents_768' as table_name, embedding_model, content_type, COUNT(*) as count
                FROM documents_768
                GROUP BY embedding_model, content_type
                ORDER BY table_name, embedding_model, content_type
            `;
            
            const modelsResult = await client.query(modelsQuery);
            stats.availableModels = modelsResult.rows;
        } catch (error) {
            stats.availableModels = [];
        }
        
        // Get available libraries
        try {
            const librariesQuery = `
                SELECT xeto_library, COUNT(*) as count
                FROM (
                    SELECT xeto_library FROM documents_1536 WHERE xeto_library IS NOT NULL
                    UNION ALL
                    SELECT xeto_library FROM documents_3072 WHERE xeto_library IS NOT NULL
                    UNION ALL
                    SELECT xeto_library FROM documents_768 WHERE xeto_library IS NOT NULL
                ) as all_libraries
                GROUP BY xeto_library
                ORDER BY count DESC
            `;
            
            const librariesResult = await client.query(librariesQuery);
            stats.availableLibraries = librariesResult.rows;
        } catch (error) {
            stats.availableLibraries = [];
        }
        
        client.release();
        return stats;
    } catch (error) {
        console.error('❌ Failed to get database statistics:', error.message);
        return {};
    }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
    try {
        const client = await getPool().connect();
        
        const queries = [
            { name: 'documents', query: 'SELECT COUNT(*) as count FROM documents' },
            { name: 'benchmark_results', query: 'SELECT COUNT(*) as count FROM benchmark_results' },
            { name: 'test_queries', query: 'SELECT COUNT(*) as count FROM test_queries' },
            { name: 'performance_metrics', query: 'SELECT COUNT(*) as count FROM performance_metrics' }
        ];
        
        const stats = {};
        for (const { name, query } of queries) {
            try {
                const result = await client.query(query);
                stats[name] = parseInt(result.rows[0].count);
            } catch (error) {
                stats[name] = 0; // Table might not exist yet
            }
        }
        
        client.release();
        return stats;
    } catch (error) {
        console.error('❌ Failed to get database statistics:', error.message);
        return {};
    }
}

/**
 * Execute a query with error handling
 */
export async function executeQuery(query, params = []) {
    const client = await getPool().connect();
    try {
        const result = await client.query(query, params);
        return result;
    } catch (error) {
        console.error('Query execution error:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Execute multiple queries in a transaction
 */
export async function executeTransaction(queries) {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        
        const results = [];
        for (const { query, params = [] } of queries) {
            const result = await client.query(query, params);
            results.push(result);
        }
        
        await client.query('COMMIT');
        return results;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Transaction error:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Close database connection pool
 */
export async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
        console.log('Database connection pool closed');
    }
}

/**
 * Setup multi-dimension database (install extension, initialize schema)
 */
export async function setupMultiDimensionDatabase() {
    console.log('🔧 Setting up multi-dimension database...');
    
    // Test connection
    const connectionOk = await testConnection();
    if (!connectionOk) {
        throw new Error('Cannot connect to database');
    }
    
    // Install pgvector extension
    const extensionOk = await installPgvectorExtension();
    if (!extensionOk) {
        throw new Error('Failed to install pgvector extension');
    }
    
    // Initialize schema
    const schemaOk = await initializeMultiDimensionSchema();
    if (!schemaOk) {
        throw new Error('Failed to initialize multi-dimension database schema');
    }
    
    // Get initial stats
    const stats = await getMultiDimensionDatabaseStats();
    console.log('📊 Multi-dimension database statistics:', stats);
    
    console.log('✅ Multi-dimension database setup complete');
    return true;
}

/**
 * Setup database (install extension, initialize schema)
 */
export async function setupDatabase() {
    console.log('🔧 Setting up database...');
    
    // Test connection
    const connectionOk = await testConnection();
    if (!connectionOk) {
        throw new Error('Cannot connect to database');
    }
    
    // Install pgvector extension
    const extensionOk = await installPgvectorExtension();
    if (!extensionOk) {
        throw new Error('Failed to install pgvector extension');
    }
    
    // Initialize schema
    const schemaOk = await initializeSchema();
    if (!schemaOk) {
        throw new Error('Failed to initialize database schema');
    }
    
    // Get initial stats
    const stats = await getDatabaseStats();
    console.log('📊 Database statistics:', stats);
    
    console.log('✅ Database setup complete');
    return true;
}

/**
 * Clear all documents from the multi-dimension database
 */
export async function clearMultiDimensionDatabase() {
    try {
        await executeQuery('DELETE FROM documents_1536');
        await executeQuery('DELETE FROM documents_3072');
        await executeQuery('DELETE FROM documents_768');
        await executeQuery('DELETE FROM benchmark_results');
        await executeQuery('DELETE FROM performance_metrics');
        
        console.log('✅ Multi-dimension database cleared');
        return true;
    } catch (error) {
        console.error('❌ Failed to clear multi-dimension database:', error.message);
        return false;
    }
}

/**
 * Clear all documents from the database
 */
export async function clearPostgresDatabase() {
    try {
        await executeQuery('DELETE FROM documents');
        await executeQuery('DELETE FROM benchmark_results');
        await executeQuery('DELETE FROM performance_metrics');
        
        console.log('✅ PostgreSQL database cleared');
        return true;
    } catch (error) {
        console.error('❌ Failed to clear database:', error.message);
        return false;
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Received SIGINT, closing database connections...');
    await closePool();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, closing database connections...');
    await closePool();
    process.exit(0);
});
