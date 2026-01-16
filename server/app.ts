import express from 'express';
import cors from 'cors';
import multer from 'multer';
import 'dotenv/config';
import { validateUPC } from './utils/validation.js';
import { sanitizeUPC } from './utils/sanitization.js';
import { scanBarcode } from './services/barcodeService.js';
import { searchComicByUPC } from './services/metronService.js';

const app = express();

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://comic-price-evaluator.vercel.app'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Manual UPC search (SearchBar uses this)
app.get('/api/comics', async (req, res) => {
  const upc = req.query.search as string;
  const cleanedUPC = sanitizeUPC(upc);
  
  const validation = validateUPC(cleanedUPC);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    const comic = await searchComicByUPC(cleanedUPC);

    if (!comic) {
      res.status(404).json({ error: 'Comic not found' });
      return;
    }

    console.log(`Found comic with UPC: ${cleanedUPC}`);
    res.json(comic);
  } catch (error) {
    console.log('Error searching comic:', error);
    res.status(500).json({ error: 'Failed to search comics' });
  }
});

// Image upload with barcode scanning (FileUpload uses this)
app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    // Step 1: Scan barcode using Python service
    const upc = await scanBarcode(req.file.buffer);
    
    if (!upc) {
      res.status(400).json({ error: 'Could not detect barcode' });
      return;
    }

    console.log(`✅ Scanned UPC: ${upc}`);

    // Step 2: Look up comic using Metron API
    const comic = await searchComicByUPC(upc + '00111');
    
    if (!comic) {
      res.status(404).json({ error: 'Comic not found', upc });
      return;
    }

    // Step 3: Return comic data
    res.json(comic);

  } catch (error) {
    console.error('❌ Upload processing error:', error);
    res.status(500).json({ error: 'Failed to process image' });
  }
});

export default app;