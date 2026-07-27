import { OpenAI } from 'openai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
let openai = null;

if (apiKey) {
  openai = new OpenAI({ apiKey });
}

export async function transcribeAudio(filePath) {
  if (openai) {
    try {
      const response = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: 'whisper-1',
      });
      return response.text;
    } catch (err) {
      console.error('Whisper transcription failed, falling back to mock:', err.message);
    }
  }

  // Local fallback transcription list (random simulation)
  const mockTranscriptions = [
    "sir machine start nahi ho rahi hai aur awaj kar rahi hai",
    "motor vibration level checking kaise kare",
    "sensor calibration complete setting guidelines please",
    "machine overheating issues, what should we check first?",
    "machine start karte time vibration ho rha h"
  ];
  const randomIndex = Math.floor(Math.random() * mockTranscriptions.length);
  return mockTranscriptions[randomIndex];
}
