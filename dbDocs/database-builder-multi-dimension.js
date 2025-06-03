/**
 * PostgreSQL + pgvector Multi-Dimension Database Builder
 * 
 * Builds embedding databases directly in PostgreSQL with pgvector for vector similarity search.
 * Supports multiple embedding dimensions (1536, 3072, 768) in separate tables.
 */

import 'dotenv/config';
import { 
    getPool, 
    executeQuery, 
    executeTransaction, 
    getMultiDimensionDatabaseStats,
    testConnection,
    checkPgvectorExtension 
} from './connection_multi_dimension.js';
import * as xetoParser from '../content-processors/xeto-parser.js';
import * as markdownConverter from '../content-processors/markdown-converter.js';
import * as jsonAstConverter from '../content-processors/json-ast-converter.js';
import * as documentationProcessor from '../content-processors/documentation-processor.js';
import * as openaiEmbeddings from '../embeddings/openai-embeddings.js';
import * as geminiEmbeddings from '../embeddings/gemini-embeddings.js';
import fs from 'fs-extra';
import path from 'path';

/**
 * Build embedding database in PostgreSQL with pgvector
 * @param {Object} config - Build configuration
 * @returns {Object} Build result with statistics
 */
export async function buildMultiDimensionEmbeddingDatabase(config) {
    const startTime = Date.now();
    
    console.log('🏗️  Building Multi-Dimension PostgreSQL Embedding Database');
    console.log(`Source: ${config.xetoPath}`);
    console.log(`Database: PostgreSQL + pgvector (Multi-Dimension)`);
    console.log(`Providers: ${config.providers.join(', ')}`);
    console.log(`Formats: ${config.contentFormats.join(', ')}`);
    
    try {
        // Step 1: Verify database connection and pgvector
        console.log('\n🔌 Step 1: Verifying Database Connection');
        const connectionOk = await testConnection();
        if (!connectionOk) {
            throw new Error('Database connection failed');
        }
        
        const pgvectorOk = await checkPgvectorExtension();
        if (!pgvectorOk) {
            throw new Error('pgvector extension not available');
        }
        console.log('✅ Database and pgvector ready');
        
        // Step 2: Parse Xeto content
        console.log('\n📖 Step 2: Parsing Xeto Content');
        const parseResult = await xetoParser.parseXetoDirectory(config.xetoPath);
        
        // Check if parsing was successful - parser returns array of files directly
        const files = Array.isArray(parseResult) ? parseResult : parseResult?.files || [];
        if (!files || files.length === 0) {
            const resultSummary = parseResult ? `type: ${Array.isArray(parseResult) ? 'array' : 'object'}, length: ${parseResult.length || 'N/A'}, keys: ${Object.keys(parseResult).slice(0, 5).join(', ')}...` : 'null';
            throw new Error(`No Xeto files found. Parse result summary: ${resultSummary}`);
        }
        
        // Calculate total types from all files
        const totalTypes = files.reduce((sum, file) => sum + (file.typeDefinitions?.length || 0), 0);
        if (totalTypes === 0) {
            throw new Error('No type definitions found in any Xeto files');
        }
        
        // Normalize parseResult structure
        const normalizedParseResult = {
            files: files,
            totalTypes: totalTypes,
            totalFiles: files.length
        };
        
        console.log(`Found ${normalizedParseResult.files.length} xeto files in ${config.xetoPath}`);
        console.log(`Successfully parsed ${normalizedParseResult.files.length} xeto files`);
        console.log(`✅ Parsed ${normalizedParseResult.totalTypes} types from ${normalizedParseResult.totalFiles} files`);
        
        // Step 3: Convert content formats
        console.log('\n🔄 Step 3: Converting Content Formats');
        const formats = {
            xeto: [],
            markdown: [],
            json: [],
            documentation: []
        };
        
        // Process each file for different formats
        for (const file of normalizedParseResult.files) {
            // Xeto format (always included)
            if (config.contentFormats.includes('xeto')) {
                for (const type of file.typeDefinitions) {
                    formats.xeto.push({
                        content: `${type.name}: ${type.description}. Inherits: ${type.inherits.join(', ')}. ${type.rawDefinition}`,
                        metadata: {
                            format: 'xeto',
                            source: file.fileName,
                            library: file.library?.name || 'unknown',
                            typeName: type.name,
                            category: type.category || 'unknown',
                            isAbstract: type.isAbstract,
                            inherits: type.inherits,
                            filePath: file.filePath,
                            contentType: 'xeto'
                        }
                    });
                }
            }
            
            // Markdown format
            if (config.contentFormats.includes('markdown')) {
                try {
                    const markdownResult = await markdownConverter.convertFileToMarkdown(file, {
                        includeExamples: true,
                        hvacContext: true
                    });
                    
                    if (markdownResult.success) {
                        formats.markdown.push({
                            content: markdownResult.content,
                            metadata: {
                                format: 'markdown',
                                source: file.fileName,
                                library: file.library?.name || 'unknown',
                                typeCount: file.typeDefinitions.length,
                                filePath: file.filePath,
                                contentType: 'markdown'
                            }
                        });
                    }
                } catch (error) {
                    console.warn(`Failed to convert ${file.fileName} to markdown:`, error.message);
                }
            }
            
            // JSON AST format
            if (config.contentFormats.includes('json')) {
                try {
                    const jsonResult = await jsonAstConverter.convertFileToJsonAst(file);
                    
                    if (jsonResult.success) {
                        formats.json.push({
                            content: jsonResult.content,
                            metadata: {
                                format: 'json',
                                source: file.fileName,
                                library: file.library?.name || 'unknown',
                                typeCount: file.typeDefinitions.length,
                                filePath: file.filePath,
                                contentType: 'json'
                            }
                        });
                    }
                } catch (error) {
                    console.warn(`Failed to convert ${file.fileName} to JSON AST:`, error.message);
                }
            }
        }
        
        // Process documentation files if configured
        if (config.contentFormats.includes('documentation') && config.docPath) {
            console.log(`\n📚 Processing documentation files from ${config.docPath}`);
            try {
                const docFiles = await documentationProcessor.processDocumentationDirectory(config.docPath);
                
                if (docFiles.length > 0) {
                    for (const docFile of docFiles) {
                        // Create documentation chunks
                        const docChunks = documentationProcessor.createDocumentationChunks(docFile);
                        
                        // Add to formats
                        formats.documentation.push(...docChunks);
                    }
                    
                    console.log(`✅ Processed ${docFiles.length} documentation files`);
                } else {
                    console.warn(`⚠️  No documentation files found in ${config.docPath}`);
                }
            } catch (error) {
                console.warn(`⚠️  Error processing documentation: ${error.message}`);
            }
        }
        
        console.log(`  Xeto items: ${formats.xeto.length}`);
        console.log(`  Markdown items: ${formats.markdown.length}`);
        console.log(`  JSON items: ${formats.json.length}`);
        console.log(`  Documentation items: ${formats.documentation.length}`);
        
        // Step 4: Create content chunks
        console.log('\n✂️  Step 4: Creating Content Chunks');
        const chunkedContent = {};
        
        for (const format of config.contentFormats) {
            chunkedContent[format] = {};
            for (const chunkSize of config.chunkSizes) {
                chunkedContent[format][chunkSize] = createChunks(formats[format], chunkSize);
                console.log(`  ${format} (${chunkSize} chars): ${chunkedContent[format][chunkSize].length} chunks`);
            }
        }
        
        // Step 5: Generate embeddings and store in PostgreSQL
        console.log('\n🧮 Step 5: Generating Embeddings and Storing in PostgreSQL');
        
        const statistics = {
            totalItems: 0,
            totalEmbeddings: 0,
            providerStats: {},
            sourceStats: {
                totalFiles: normalizedParseResult.totalFiles,
                totalTypes: normalizedParseResult.totalTypes,
                libraries: normalizedParseResult.files.map(f => f.library?.name || 'unknown').filter((v, i, a) => a.indexOf(v) === i)
            }
        };
        
        const embeddingResults = {};
        let totalCost = 0;
        
        for (const provider of config.providers) {
            embeddingResults[provider] = {};
            statistics.providerStats[provider] = {
                totalEmbeddings: 0,
                models: 0,
                cost: 0
            };
            
            for (const model of config.models[provider]) {
                console.log(`\n  Generating ${provider} ${model} embeddings...`);
                embeddingResults[provider][model] = {};
                
                for (const format of config.contentFormats) {
                    for (const chunkSize of config.chunkSizes) {
                        const content = chunkedContent[format][chunkSize];
                        if (content.length === 0) continue;
                        
                        console.log(`    ${format} (${chunkSize} chars): ${content.length} items`);
                        
                        try {
                            // Generate embeddings
                            const embeddings = await generateEmbeddings(
                                content.map(item => item.content),
                                provider,
                                model,
                                config.batchSize
                            );
                            
                            if (embeddings.embeddings && embeddings.embeddings.length > 0) {
                                // Store in PostgreSQL with multi-dimension support
                                await storeMultiDimensionEmbeddingsInPostgres(
                                    content,
                                    embeddings.embeddings,
                                    provider,
                                    model,
                                    format,
                                    chunkSize
                                );
                                
                                console.log(`      ✅ Generated and stored ${embeddings.embeddings.length} embeddings`);
                                
                                statistics.totalEmbeddings += embeddings.embeddings.length;
                                statistics.providerStats[provider].totalEmbeddings += embeddings.embeddings.length;
                                
                                // Track cost if available
                                if (embeddings.summary && embeddings.summary.totalCost) {
                                    statistics.providerStats[provider].cost += embeddings.summary.totalCost;
                                    totalCost += embeddings.summary.totalCost;
                                }
                            }
                            
                            embeddingResults[provider][model][format] = embeddingResults[provider][model][format] || {};
                            embeddingResults[provider][model][format][chunkSize] = embeddings;
                            
                        } catch (error) {
                            console.log(`      ❌ Failed: ${error.message}`);
                            embeddingResults[provider][model][format] = embeddingResults[provider][model][format] || {};
                            embeddingResults[provider][model][format][chunkSize] = [];
                        }
                    }
                }
                
                statistics.providerStats[provider].models++;
            }
        }
        
        // Step 6: Generate final statistics
        console.log('\n📊 Step 6: Generating Statistics');
        
        const finalStats = await getMultiDimensionDatabaseStats();
        statistics.totalItems = finalStats.documents || 0;
        
        const totalTime = Date.now() - startTime;
        
        console.log('\n✅ Multi-Dimension PostgreSQL Database Build Complete!');
        console.log(`Total time: ${(totalTime / 1000).toFixed(1)}s`);
        console.log(`Total content items: ${statistics.totalItems}`);
        console.log(`Total embeddings generated: ${statistics.totalEmbeddings}`);
        if (totalCost > 0) {
            console.log(`Total cost: $${totalCost.toFixed(2)}`);
        }
        
        return {
            success: true,
            statistics,
            embeddingResults,
            metadata: {
                buildTime: totalTime,
                config,
                timestamp: new Date().toISOString(),
                totalCost
            }
        };
        
    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`\n❌ Multi-Dimension PostgreSQL database build failed: ${error.message}`);
        
        return {
            success: false,
            error: error.message,
            metadata: {
                buildTime: totalTime,
                config,
                timestamp: new Date().toISOString()
            }
        };
    }
}

/**
 * Generate embeddings using specified provider and model
 */
async function generateEmbeddings(texts, provider, model, batchSize) {
    if (provider === 'openai') {
        return await openaiEmbeddings.generateEmbeddings(texts, model, batchSize);
    } else if (provider === 'gemini') {
        return await geminiEmbeddings.generateEmbeddings(texts, model, batchSize);
    } else {
        throw new Error(`Unsupported embedding provider: ${provider}`);
    }
}

/**
 * Store embeddings in PostgreSQL with multi-dimension support
 * Uses different tables based on embedding dimensions
 */
async function storeMultiDimensionEmbeddingsInPostgres(contentItems, embeddings, provider, model, format, chunkSize) {
    const queries = [];
    
    for (let i = 0; i < contentItems.length && i < embeddings.length; i++) {
        const item = contentItems[i];
        const embeddingObj = embeddings[i];
        const embedding = embeddingObj.embedding || embeddingObj; // Extract just the vector array
        
        // Determine embedding dimensions
        const dimensions = embedding.length;
        
        // Select the appropriate table based on dimensions
        let tableName;
        if (dimensions === 1536) {
            tableName = 'documents_1536';
        } else if (dimensions === 3072) {
            tableName = 'documents_3072';
        } else if (dimensions === 768) {
            tableName = 'documents_768';
        } else {
            throw new Error(`Unsupported embedding dimensions: ${dimensions}`);
        }
        
        queries.push({
            query: `
                INSERT INTO ${tableName} (
                    content, 
                    content_type, 
                    embedding_model, 
                    embedding, 
                    metadata, 
                    xeto_spec_name, 
                    xeto_library, 
                    inheritance_path, 
                    file_path
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `,
            params: [
                item.content,
                format,
                `${provider}_${model}`,
                JSON.stringify(embedding), // pgvector will handle the conversion
                JSON.stringify({
                    ...item.metadata,
                    chunkSize,
                    embeddingProvider: provider,
                    embeddingModel: model,
                    embeddingDimensions: dimensions
                }),
                item.metadata.typeName || null,
                item.metadata.library || null,
                item.metadata.inherits || null,
                item.metadata.filePath || null
            ]
        });
    }
    
    // Execute all inserts in a transaction
    await executeTransaction(queries);
}

/**
 * Create content chunks of specified size
 */
function createChunks(contentItems, chunkSize) {
    const chunks = [];
    
    for (const item of contentItems) {
        const content = item.content;
        
        if (content.length <= chunkSize) {
            // Content fits in one chunk
            chunks.push({
                content,
                metadata: {
                    ...item.metadata,
                    chunkIndex: 0,
                    totalChunks: 1,
                    chunkSize
                }
            });
        } else {
            // Split into multiple chunks with overlap
            const overlap = Math.min(100, Math.floor(chunkSize * 0.1));
            let start = 0;
            let chunkIndex = 0;
            
            while (start < content.length) {
                const end = Math.min(start + chunkSize, content.length);
                const chunkContent = content.slice(start, end);
                
                chunks.push({
                    content: chunkContent,
                    metadata: {
                        ...item.metadata,
                        chunkIndex,
                        totalChunks: Math.ceil(content.length / (chunkSize - overlap)),
                        chunkSize,
                        chunkStart: start,
                        chunkEnd: end
                    }
                });
                
                start = end - overlap;
                chunkIndex++;
                
                if (end >= content.length) break;
            }
        }
    }
    
    return chunks;
}

/**
 * Query PostgreSQL database for vector similarity search with multi-dimension support
 * @param {string} queryText - Text to search for
 * @param {string} provider - Embedding provider
 * @param {string} model - Embedding model
 * @param {Object} options - Search options
 * @returns {Array} Search results
 */
export async function queryMultiDimensionPostgresDatabase(queryText, provider, model, options = {}) {
    const {
        contentType = null,
        topK = 10,
        similarityThreshold = 0.7,
        library = null,
        category = null
    } = options;
    
    // Generate query embedding
    const queryEmbeddingResult = await generateEmbeddings([queryText], provider, model, 1);
    if (!queryEmbeddingResult.success || !queryEmbeddingResult.embeddings || queryEmbeddingResult.embeddings.length === 0) {
        throw new Error('Failed to generate query embedding');
    }
    
    const queryEmbeddingObj = queryEmbeddingResult.embeddings[0];
    const queryEmbedding = queryEmbeddingObj.embedding || queryEmbeddingObj;
    
    // Determine dimensions and select appropriate table
    const dimensions = queryEmbedding.length;
    let tableName;
    
    if (dimensions === 1536) {
        tableName = 'documents_1536';
    } else if (dimensions === 3072) {
        tableName = 'documents_3072';
    } else if (dimensions === 768) {
        tableName = 'documents_768';
    } else {
        throw new Error(`Unsupported embedding dimensions: ${dimensions}`);
    }
    
    // Build SQL query with filters
    let whereClause = 'WHERE embedding_model = $2';
    const params = [JSON.stringify(queryEmbedding), `${provider}_${model}`];
    let paramIndex = 3;
    
    if (contentType) {
        whereClause += ` AND content_type = $${paramIndex}`;
        params.push(contentType);
        paramIndex++;
    }
    
    if (library) {
        whereClause += ` AND xeto_library = $${paramIndex}`;
        params.push(library);
        paramIndex++;
    }
    
    if (category) {
        whereClause += ` AND metadata->>'category' = $${paramIndex}`;
        params.push(category);
        paramIndex++;
    }
    
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
        ${whereClause}
        AND 1 - (embedding <=> $1::vector) >= $${paramIndex}
        ORDER BY embedding <=> $1::vector
        LIMIT $${paramIndex + 1}
    `;
    
    params.push(similarityThreshold, topK);
    
    const result = await executeQuery(query, params);
    
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

export { buildMultiDimensionEmbeddingDatabase as buildEmbeddingDatabase };
