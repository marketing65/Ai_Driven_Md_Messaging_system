import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import { query, supabase } from '../config/db.js';

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
let openai = null;

if (apiKey) {
  openai = new OpenAI({ apiKey });
  console.log('AI Service: OpenAI client initialized');
} else {
  console.warn('AI Service: OPENAI_API_KEY is missing. Running in MOCK Mode.');
}

// 1. Language pipeline: Detect, translate to English, and normalize
export async function processLanguagePipeline(text) {
  if (!text || text.trim() === '') return { original: '', normalized: 'empty' };

  if (openai) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert translation and linguistic normalization service. Your task is to process inputs from users that may be in Hindi, English, or Hinglish (Hindi written in Latin script, e.g., "sir machine me sound aa rha h").
Follow these instructions:
1. Detect the source language.
2. Translate it into clean, grammatically correct, and standard business English.
3. Normalize the phrasing. Ensure the normalized English preserves the core informational intent (e.g., if a user asks "should I know the card number" or "can you tell me the card number", normalize the phrasing to represent the underlying search intent, such as "requesting the card number" or "what is the card number").
4. Output your response as a valid JSON object with the following fields:
   - "detectedLanguage": The language detected (e.g. "Hindi", "Hinglish", "English")
   - "normalizedEnglish": The translated, normalized, grammatically correct English version representing the core search intent.
   
   Example:
   Input: "मशीन स्टार्ट करते टाइम आवाज कर रही है"
   Output: {"detectedLanguage": "Hindi", "normalizedEnglish": "The machine is making a noise when starting up."}
   
   Output ONLY the JSON object. Do not include markdown code block tags.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      return {
        original: text,
        normalized: result.normalizedEnglish,
        language: result.detectedLanguage
      };
    } catch (err) {
      console.error('Language pipeline error, falling back to local normalizer:', err.message);
    }
  }

  // Local mock translation / normalization
  return localMockNormalize(text);
}

export function localMockNormalize(text) {
  const lowercase = text.toLowerCase().trim();
  let normalized = text;
  let language = 'English';

  if (lowercase.includes('vibration') || lowercase.includes('vibrate') || lowercase.includes('hil rha') || lowercase.includes('kampan')) {
    normalized = "The machine is experiencing vibration issues.";
    language = lowercase.match(/[a-zA-Z]/) ? 'Hinglish' : 'Hindi';
  } else if (lowercase.includes('sound') || lowercase.includes('awaj') || lowercase.includes('aawaz') || lowercase.includes('shor') || lowercase.includes('noise')) {
    normalized = "The machine is making a loud noise during operation.";
    language = lowercase.match(/[a-zA-Z]/) ? 'Hinglish' : 'Hindi';
  } else if (lowercase.includes('overheat') || lowercase.includes('garam') || lowercase.includes('heat')) {
    normalized = "The machine is experiencing overheating problems.";
    language = lowercase.match(/[a-zA-Z]/) ? 'Hinglish' : 'Hindi';
  } else if (lowercase.includes('calibrate') || lowercase.includes('setting') || lowercase.includes('theek karna')) {
    normalized = "What is the procedure for sensor calibration?";
    language = lowercase.match(/[a-zA-Z]/) ? 'Hinglish' : 'Hindi';
  }

  return {
    original: text,
    normalized,
    language
  };
}

// 2. Generate Vector Embeddings
export async function getEmbedding(text) {
  if (openai) {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return response.data[0].embedding;
    } catch (err) {
      console.error('OpenAI embedding generation failed:', err.message);
    }
  }

  // Local fallback mock embedding
  return generateMockEmbedding(text);
}

export function generateMockEmbedding(text) {
  // Simple deterministic pseudo-random embedding based on words to simulate semantic closeness
  const words = text.toLowerCase().split(/\s+/);
  let vector = Array.from({ length: 1536 }, (_, i) => {
    let hash = 0;
    const key = `seed-${i}`;
    for (let charIdx = 0; charIdx < key.length; charIdx++) {
      hash = (hash << 5) - hash + key.charCodeAt(charIdx);
      hash |= 0;
    }
    // Mix word hashes
    words.forEach(w => {
      for (let j = 0; j < Math.min(w.length, 5); j++) {
        hash = (hash << 5) - hash + w.charCodeAt(j);
        hash |= 0;
      }
    });
    return (hash % 1000) / 1000;
  });

  // Normalize
  const mag = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map(val => val / mag);
}

// 3. Multi-Query Expansion
async function expandQuery(originalQuery) {
  if (!openai) return [originalQuery];
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert search query expansion assistant. 
Given a user query for a company knowledge base, generate 3 alternative queries.
Use different synonyms, phrasings, or related search terms. 
Keep them concise (2-4 words each).
Output ONLY the 3 queries, one per line, with no bullet points, numbers, or extra text.`
        },
        {
          role: 'user',
          content: originalQuery
        }
      ],
      temperature: 0.1,
      max_tokens: 100
    });

    const lines = response.choices[0].message.content
      .split('\n')
      .map(line => line.replace(/^[-*\d.\s]+/, '').trim())
      .filter(line => line.length > 0);

    return [originalQuery, ...lines];
  } catch (err) {
    console.error('[RAG] Query expansion failed, falling back to original query:', err.message);
    return [originalQuery];
  }
}

async function getMultipleEmbeddings(texts) {
  const embeddings = [];
  for (const text of texts) {
    const emb = await getEmbedding(text);
    embeddings.push(emb);
  }
  return embeddings;
}

// 4. Vector Similarity Search (Hybrid: Vector + Keyword overlap boost)
export async function searchSimilarKnowledge(queryText, topK = 15) {
  const expandedQueries = await expandQuery(queryText);
  console.log(`[RAG] Expanded queries for search:`, expandedQueries);

  const queryEmbeddings = await getMultipleEmbeddings(expandedQueries);
  let results = [];

  try {
    // Fetch all candidates from knowledge base
    const { data: rows, error: fetchErr } = await supabase
      .from('knowledge_base')
      .select('id, question, answer, embedding');

    if (fetchErr) throw fetchErr;

    if (rows && rows.length > 0) {
      const candidates = rows.map(row => {
        let emb = null;
        try {
          if (typeof row.embedding === 'string') {
            emb = JSON.parse(row.embedding);
          } else if (Array.isArray(row.embedding)) {
            emb = row.embedding;
          }
        } catch (e) { /* ignore */ }
        return { ...row, emb };
      }).filter(c => c.emb && Array.isArray(c.emb));

      const candidateScores = new Map();

      candidates.forEach(candidate => {
        let maxSim = -1;
        queryEmbeddings.forEach(queryEmb => {
          // Dot product (cosine similarity)
          let dot = 0;
          const len = Math.min(queryEmb.length, candidate.emb.length);
          for (let i = 0; i < len; i++) dot += queryEmb[i] * candidate.emb[i];
          if (dot > maxSim) maxSim = dot;
        });

        // ── Hybrid Search: Keyword Overlap Boost with Stop-Word Filtering ──
        const STOP_WORDS = new Set([
          'should', 'would', 'could', 'shall', 'will', 'please', 'know', 'tell', 'want',
          'what', 'when', 'where', 'which', 'who', 'how', 'why', 'have', 'does', 'do',
          'is', 'are', 'was', 'were', 'am', 'been', 'being', 'get', 'got', 'need', 'ask',
          'about', 'for', 'with', 'from', 'into', 'under', 'over', 'between', 'among',
          'the', 'a', 'an', 'some', 'any', 'that', 'this', 'these', 'those', 'there',
          'here', 'can', 'may', 'might', 'must', 'ought', 'shouldnt', 'cant', 'wont',
          'sir', 'madam', 'hello', 'hey', 'hi', 'bhai', 'yaar', 'please', 'kindly', 'inform',
          'informed', 'necessary'
        ]);

        const cleanQuery = queryText.toLowerCase().replace(/[^\w\s]/g, '');
        const queryWords = cleanQuery.split(/\s+/)
          .filter(w => w.length > 2 && !STOP_WORDS.has(w)); // only match content-rich words

        const candidateText = (candidate.question + ' ' + candidate.answer).toLowerCase();
        let matchCount = 0;

        queryWords.forEach(word => {
          if (candidateText.includes(word)) {
            matchCount++;
          }
        });

        // Calculate a boost of up to +0.25 based on matching keywords
        const keywordBoost = queryWords.length > 0 ? (matchCount / queryWords.length) * 0.25 : 0;

        // Final score combines vector similarity + keyword boost
        const finalScore = maxSim + keywordBoost;

        candidateScores.set(candidate.id, {
          id: candidate.id,
          question: candidate.question,
          answer: candidate.answer,
          similarity: finalScore,
          vectorSimilarity: maxSim,
          keywordBoost
        });
      });

      results = Array.from(candidateScores.values());
    }
  } catch (err) {
    console.error('[RAG] Multi-query search failed:', err.message);
  }

  // Sort and return topK
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK);
}

// 5. Generate Final RAG Response
export async function queryRAG(normalizedQuery) {
  const BASELINE_THRESHOLD = 0.25; // Lower threshold to allow boosted matches and LLM-driven filtering
  const sources = await searchSimilarKnowledge(normalizedQuery, 15);

  // Debug: log similarity scores to help diagnose RAG matching
  console.log(`RAG Search for: "${normalizedQuery}"`);
  sources.slice(0, 5).forEach((s, i) => {
    console.log(`  [${i + 1}] similarity=${s.similarity.toFixed(4)} (vector=${s.vectorSimilarity.toFixed(4)}, boost=${s.keywordBoost.toFixed(4)}) | "${s.question}"`);
  });

  // Filter sources that meet similarity threshold
  const matchingSources = sources.filter(s => s.similarity >= BASELINE_THRESHOLD);

  if (matchingSources.length === 0) {
    return {
      answer: "No reliable answer found. Please ask MD.",
      confidence: sources.length > 0 ? sources[0].similarity : 0,
      sourcesCount: 0,
      isReliable: false,
      sources: []
    };
  }

  const bestSimilarity = matchingSources[0].similarity;

  if (openai) {
    try {
      const context = matchingSources.map((s, idx) => `ID: ${s.id}\nQuestion: ${s.question}\nAnswer: ${s.answer}`).join('\n\n');

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an advanced AI Knowledge Assistant for Akash Blowers.

Your role is to answer user queries with maximum accuracy using ONLY the provided knowledge base.

---

STRICT RULES:

1. Use ONLY the provided knowledge base. Do NOT use external knowledge, assumptions, or prior training.
2. If the knowledge base does NOT contain relevant information, respond EXACTLY with:
   "No reliable answer found. Please ask MD."
3. Never hallucinate. Never generate or assume missing data.
4. Always interpret the user’s intent intelligently, even if the query is:

   * Very short (e.g., "card", "price", "email")
   * Indirect (e.g., "should I know the card number", "do you have card", "can I get card")
5. Treat all such queries as requests to retrieve the closest relevant information from the knowledge base.
6. If relevant data exists, provide it directly without refusal.

---

INTERNAL PROCESS (DO NOT OUTPUT):

1. Identify user intent (data request, explanation, confirmation, etc.)
2. Search for exact or closest semantic match in the knowledge base
3. Filter out irrelevant or weak matches
4. Extract only accurate and relevant information
5. Construct a precise answer

---

RESPONSE RULES:

* Be clear, concise, and professional
* Use structured markdown formatting
* Use bullet points or tables when helpful
* Do NOT mention:

  * Sources
  * Context
  * Internal reasoning

---

EDGE CASE HANDLING:

1. If partial information is available:

   * Provide only what exists
   * Do NOT fill gaps with assumptions

2. If multiple relevant matches exist:

   * Present all clearly

3. If query is ambiguous:

   * Choose the most relevant interpretation based on available data

4. If no match is found:

   * Respond EXACTLY:
     "No reliable answer found. Please ask MD."

---

OUTPUT STYLE:

* Deliver answers like an expert assistant
* Be confident but strictly factual
* Avoid unnecessary explanations

---

EXAMPLES:

Example 1:

* Card Number: 1892749279284

FINAL PRINCIPLE:

Accuracy over verbosity. Retrieval over assumption. Discipline over creativity.
`
          },
          {
            role: 'user',
            content: `Context sources:\n${context}\n\nUser Query: ${normalizedQuery}`
          }
        ],
        temperature: 0.1
      });

      const answerText = response.choices[0].message.content.trim();
      const isReliable = !answerText.includes("No reliable answer found");
      const matchedQuestion = matchingSources[0].question;

      const finalAnswer = isReliable
        ? `**Matched Question:** "${matchedQuestion}"\n\n${answerText}`
        : answerText;

      return {
        answer: finalAnswer,
        confidence: bestSimilarity,
        sourcesCount: matchingSources.length,
        isReliable,
        sources: matchingSources.map(s => ({ question: s.question, answer: s.answer }))
      };
    } catch (err) {
      console.error('OpenAI completion failed:', err.message);
    }
  }

  // Local fallback response construction
  const bestSource = matchingSources[0];
  const formattedAnswer = `**Matched Question:** "${bestSource.question}"\n\nBased on our company database, here is the verified procedure:\n\n${bestSource.answer}\n\n(Generated via local knowledge matching)`;

  return {
    answer: formattedAnswer,
    confidence: bestSimilarity,
    sourcesCount: matchingSources.length,
    isReliable: true,
    sources: matchingSources.map(s => ({ question: s.question, answer: s.answer }))
  };
}

// 6. Add a QA Pair to Knowledge Base
export async function addQuestionToKnowledgeBase(question, answer) {
  const normalized = (await processLanguagePipeline(question)).normalized;
  // Generate embedding using both question and answer (matches initial seeder pattern)
  const embedding = await getEmbedding(normalized + ' ' + answer);
  const embStr = `[${embedding.join(',')}]`;

  const { error } = await supabase.from('knowledge_base').insert({
    question: normalized,
    answer,
    embedding: embStr,
  });

  if (error) throw error;
  console.log(`[KB] Added: "${normalized}"`);
}


