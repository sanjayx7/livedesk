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

// Helper to strip markdown symbols (like **, #, etc.) from AI outputs
function stripMarkdownFormatting(text) {
  if (!text) return '';
  return text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[\r\n]{3,}/g, '\n\n')
    .trim();
}

// Clean and smart text chunker
function chunkText(text, maxChunkSize = 400) {
  // First split by explicit markdown section dividers (---) or multiple newlines
  const sections = text.split(/(?:\n\s*---\s*\n|\n\s*\n\s*\n)/);
  const chunks = [];

  for (let section of sections) {
    section = section.trim();
    if (!section) continue;

    // If section is under max size, add directly
    if (section.length <= maxChunkSize) {
      chunks.push(section);
    } else {
      // Split large sections by paragraphs
      const paragraphs = section.split(/\n+/);
      let currentChunk = '';
      for (let p of paragraphs) {
        p = p.trim();
        if (!p) continue;
        if ((currentChunk + '\n' + p).length <= maxChunkSize) {
          currentChunk = currentChunk ? currentChunk + '\n' + p : p;
        } else {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = p;
        }
      }
      if (currentChunk) chunks.push(currentChunk);
    }
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

// Generate the final answer using retrieved context, history, and online status
async function generateAnswer(queryText, contextChunks, historyText = '', isSystemOnline = true, options = {}) {
  const normalizedQuery = queryText.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
  
  // Greetings handling
  const greetings = ['hi', 'hello', 'hey', 'greetings', 'hola', 'good morning', 'good afternoon', 'good evening', 'yo', 'sup', 'hello there', 'hi there'];
  if (greetings.includes(normalizedQuery)) {
    return "Hello! 👋 Welcome! How can I help you today?";
  }

  // Thanks & farewell handling
  const gratitude = ['thanks', 'thank you', 'thx', 'thank u', 'great', 'awesome', 'bye', 'goodbye'];
  if (gratitude.includes(normalizedQuery)) {
    return "You're very welcome! Let me know if you need anything else.";
  }

  const companyName = options.projectName || options.chatbotName || 'our company';
  const contextText = contextChunks.map(c => `[Source: ${c.title}]\n${c.content}`).join('\n\n');
  
  const isSalesOrDemoQuery = /\b(demo|sales|pricing|consult|consultation|package|buy|purchase|quote|cost|contact)\b/i.test(queryText);

  // Check relevance threshold: if top score is low and not a sales query, restrict response immediately
  const topScore = (contextChunks && contextChunks.length > 0) ? contextChunks[0].score : 0;
  if (!isSalesOrDemoQuery && topScore < 0.18) {
    return "I'm sorry, I don't have that information right now. Would you like me to connect you with one of our support representatives?";
  }

  const systemPrompt = isSystemOnline
    ? `You are an expert live support assistant for ${companyName}.

PERSONALITY & TONEOF VOICE:
- Be warm, professional, clear, and direct.
- Speak naturally as a human representative for ${companyName}.

CRITICAL RULES:
- NEVER mention "knowledge base", "KB", "context", or internal records to the user. Speak naturally as a support representative.
- Base your answers ONLY on the provided Context. Do NOT invent facts or give external information.
- Keep responses short, concise, and helpful (max 50 words).
- If listing points, use simple plain-text bullet points starting with "- ". Never use asterisks or hashtags.
- For sales, demo, or pricing inquiries: Answer using the provided Context or invite the visitor to leave their phone/email so a representative can follow up.

Context:
${contextText}

Recent History:
${historyText}`
    : `You are an expert live support assistant for ${companyName}. The support team is currently OFFLINE outside business hours.

PERSONALITY & TONEOF VOICE:
- Be warm, professional, clear, and direct.

CRITICAL RULES:
- NEVER mention "knowledge base", "KB", or internal databases to the user.
- Base your answers ONLY on the provided Context. Keep responses concise (max 50 words).
- Plain text only. No markdown formatting or asterisks.
- Inform the user that live agents are currently offline and ask them to share their email or phone number so our team can follow up promptly.

Context:
${contextText}

Recent History:
${historyText}`;
  
  // 1. Try Groq API
  if (process.env.GROQ_API_KEY) {
    try {
      console.log("Generating AI response via Groq API (LLaMA 3.1)...");
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
              content: systemPrompt
            },
            {
              role: 'user',
              content: queryText
            }
          ],
          max_tokens: 110,
          temperature: 0.2
        })
      });
      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return stripMarkdownFormatting(data.choices[0].message.content);
      }
    } catch (err) {
      console.error("Groq Generation Error:", err.message);
    }
  }

  // 2. Try Gemini API
  if (process.env.GEMINI_API_KEY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const prompt = `${systemPrompt}\n\nQuestion: ${queryText}\nAnswer:`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 110 }
        })
      });
      const data = await response.json();
      if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
        return stripMarkdownFormatting(data.candidates[0].content.parts[0].text);
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
              content: systemPrompt
            },
            {
              role: 'user',
              content: queryText
            }
          ],
          max_tokens: 110,
          temperature: 0.2
        })
      });
      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return stripMarkdownFormatting(data.choices[0].message.content);
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
          prompt: `${systemPrompt}\n\nQuestion: ${queryText}\n\nAnswer:`,
          stream: false
        })
      });
      const data = await response.json();
      if (data.response) {
        return stripMarkdownFormatting(data.response);
      }
    } catch (err) {
      console.error("Ollama Generation Error:", err.message);
    }
  }

  // 5. Default Local Semantic Search QA Fallback
  if (contextChunks.length > 0 && contextChunks[0].score > 0.18) {
    const raw = contextChunks[0].content;
    const cleanText = raw
      .replace(/^---+$/gm, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^Q:\s*/gm, '')
      .replace(/^A:\s*/gm, '')
      .replace(/Hope this helps!/gi, '')
      .trim();

    if (cleanText) {
      // Cut off at first 4 sentences if too long
      const sentences = cleanText.split(/(?<=[.!?])\s+/);
      const shortCleanText = sentences.slice(0, 4).join(' ');
      return stripMarkdownFormatting(shortCleanText);
    }
  }

  if (isSalesOrDemoQuery || !isSystemOnline) {
    return "Our live support team is currently offline outside business hours. Please leave your email or phone number and a representative will get back to you shortly.";
  }

  return "I'm sorry, I don't have that information right now. Would you like me to connect you with one of our support representatives?";
}

module.exports = {
  getEmbedding,
  addDocument,
  queryKnowledgeBase,
  generateAnswer
};
