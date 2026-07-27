import './load-env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from './config/db.js';
import { getEmbedding } from './services/openai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const csvPath = path.resolve(__dirname, '../Knowledge based AI Agent training Datasheet - Company Overview.csv');

console.log('Reading CSV from:', csvPath);
const csvContent = fs.readFileSync(csvPath, 'utf-8');

function parseCSV(text) {
  const records = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        i += 2;
      } else {
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      i++;
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      row.push(field);
      field = '';
      if (char === '\r' && nextChar === '\n') {
        i += 2;
      } else {
        i++;
      }
      if (row.length > 0) {
        records.push(row);
      }
      row = [];
    } else {
      field += char;
      i++;
    }
  }
  if (row.length > 0 || field !== '') {
    row.push(field);
    records.push(row);
  }
  return records;
}

const records = parseCSV(csvContent);
console.log(`Parsed ${records.length} raw rows.`);

let lastQuestion = '';
const cleanedRecords = [];

// Skip header row (records[0])
for (let idx = 1; idx < records.length; idx++) {
  const row = records[idx];
  if (row.length < 3) continue;
  
  let question = row[1] ? row[1].trim() : '';
  let answer = row[2] ? row[2].trim() : '';
  
  // Inherit question if empty
  if (!question && lastQuestion) {
    question = lastQuestion;
  } else if (question) {
    lastQuestion = question;
  }
  
  if (question && answer) {
    cleanedRecords.push({ question, answer });
  }
}

console.log(`Cleaned and normalized into ${cleanedRecords.length} Q&A entries.`);

async function seed() {
  console.log('Starting Supabase knowledge base seeding...');
  
  for (let idx = 0; idx < cleanedRecords.length; idx++) {
    const entry = cleanedRecords[idx];
    console.log(`[${idx + 1}/${cleanedRecords.length}] Generating embedding for: "${entry.question.substring(0, 40)}..."`);
    
    try {
      // 1. Generate Embedding on (question + ' ' + answer)
      const embedding = await getEmbedding(entry.question + ' ' + entry.answer);
      const embStr = `[${embedding.join(',')}]`;
      
      // 2. Insert to Supabase table
      const { data, error } = await supabase.from('knowledge_base').insert({
        question: entry.question,
        answer: entry.answer,
        embedding: embStr
      }).select();
      
      if (error) {
        console.error(`Error inserting row ${idx + 1}:`, error.message);
      } else {
        console.log(`Successfully seeded entry: "${entry.question.substring(0, 40)}" (ID: ${data[0].id})`);
      }
    } catch (err) {
      console.error(`Failed to process row ${idx + 1}:`, err.message);
    }
  }
  
  console.log('Seeding process finished!');
  process.exit(0);
}

seed();
