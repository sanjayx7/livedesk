const KBItem = require('../models/KBItem');

let extractorPromise = null;

async function getExtractor() {
  if (!extractorPromise) {
    // Lazy load transformers using dynamic import
    const { pipeline } = await import('@xenova/transformers');
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractorPromise;
}

// Generate embedding for a given text
async function getEmbedding(text) {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// Simple text chunker
function chunkText(text, maxChunkSize = 500, overlap = 100) {
  const paragraphs = text.split(/\n+/);
  const chunks = [];
  let currentChunk = '';

  for (let paragraph of paragraphs) {
    paragraph = paragraph.trim();
    if (!paragraph) continue;

    if ((currentChunk + '\n' + paragraph).length <= maxChunkSize) {
      currentChunk = currentChunk ? currentChunk + '\n' + paragraph : paragraph;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      if (paragraph.length > maxChunkSize) {
        let remaining = paragraph;
        while (remaining.length > 0) {
          chunks.push(remaining.substring(0, maxChunkSize));
          remaining = remaining.substring(maxChunkSize - overlap);
          if (remaining.length <= overlap) break;
        }
        currentChunk = '';
      } else {
        currentChunk = paragraph;
      }
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  return chunks;
}

// Compute cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Add a document to the knowledge base
async function addDocument(title, content, projectId = 'default') {
  const chunks = chunkText(content);
  for (let chunk of chunks) {
    const embedding = await getEmbedding(chunk);
    await KBItem.create({
      title,
      content: chunk,
      embedding,
      projectId
    });
  }
}

// Query the knowledge base and return top documents
async function queryKnowledgeBase(queryText, projectId = 'default', limit = 3) {
  const queryVec = await getEmbedding(queryText);
  const items = await KBItem.find({ projectId });
  
  const results = items.map(item => {
    const score = cosineSimilarity(queryVec, item.embedding);
    return {
      id: item._id,
      title: item.title,
      content: item.content,
      score
    };
  });

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// Generate the final answer using retrieved context
async function generateAnswer(queryText, contextChunks) {
  // Check for simple greetings and respond naturally
  const normalizedQuery = queryText.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
  const greetings = ['hi', 'hello', 'hey', 'greetings', 'hola', 'good morning', 'good afternoon', 'good evening', 'yo', 'sup', 'hello there', 'hi there'];
  if (greetings.includes(normalizedQuery)) {
    return "Hello! How can I help you today? Feel free to ask any questions about our products, services, or features.";
  }

  const contextText = contextChunks.map(c => `[Source: ${c.title}]\n${c.content}`).join('\n\n');
  
  // 1. Try Groq API
  if (process.env.GROQ_API_KEY) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are a helpful live-chat assistant. Use the following retrieved knowledge base context to answer the user's question. If the context does not contain the answer, answer naturally and offer to connect them to a human support representative. Keep the answer short (under 3 sentences) and professional.\n\nContext:\n${contextText}`
            },
            {
              role: 'user',
              content: queryText
            }
          ],
          max_tokens: 150,
          temperature: 0.2
        })
      });
      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content.trim();
      }
    } catch (err) {
      console.error("Groq Generation Error:", err.message);
    }
  }

  // 2. Try Gemini API
  if (process.env.GEMINI_API_KEY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const prompt = `You are a helpful live-chat assistant. Use the following retrieved knowledge base context to answer the user's question. If the context does not contain the answer, answer naturally and offer to connect them to a human support representative. Keep the answer short (under 3 sentences) and professional.
      
Context:
${contextText}

Question: ${queryText}
Answer:`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      const data = await response.json();
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
        return data.candidates[0].content.parts[0].text.trim();
      }
    } catch (err) {
      console.error("Gemini Generation Error:", err.message);
    }
  }

  // 3. Try OpenAI API
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are a helpful live-chat assistant. Use the following retrieved knowledge base context to answer the user's question. If the context does not contain the answer, answer naturally and offer to connect them to a human support representative. Keep the answer short (under 3 sentences) and professional.\n\nContext:\n${contextText}`
            },
            {
              role: 'user',
              content: queryText
            }
          ],
          max_tokens: 150,
          temperature: 0.2
        })
      });
      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content.trim();
      }
    } catch (err) {
      console.error("OpenAI Generation Error:", err.message);
    }
  }

  // 4. Try Ollama (Local LLM)
  if (process.env.OLLAMA_HOST || process.env.USE_OLLAMA === 'true') {
    try {
      const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
      const response = await fetch(`${host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL || 'llama3',
          prompt: `Context:\n${contextText}\n\nQuestion: ${queryText}\n\nAnswer the question shortly based on the context. If unknown, say "I don't know".`,
          stream: false
        })
      });
      const data = await response.json();
      if (data.response) {
        return data.response.trim();
      }
    } catch (err) {
      console.error("Ollama Generation Error:", err.message);
    }
  }

  // 5. Default Local Semantic Search QA Fallback
  if (contextChunks.length > 0 && contextChunks[0].score > 0.4) {
    return `Based on our knowledge base, here is what I found:\n\n"${contextChunks[0].content}"\n\nHope this helps! Let me know if you would like to speak to a human agent.`;
  }

  return "I'm sorry, I couldn't find an answer to your question in our knowledge base. Would you like me to connect you to a human agent?";
}

module.exports = {
  getEmbedding,
  addDocument,
  queryKnowledgeBase,
  generateAnswer
};
