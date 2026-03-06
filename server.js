// ============================================================
// server.js — The Entry Point of Our Backend Application
// ============================================================
// Think of this file as the "front door" of our app.
// When someone sends a request (like uploading a resume),
// it comes through here first, gets processed, and a response
// is sent back. Express.js makes this very easy to set up.
// ============================================================

const express = require('express');  // The web framework
const cors = require('cors');         // Allows frontend (different port) to talk to backend
const path = require('path');

// Load environment variables from .env file
// (like secret keys or port numbers you don't want hard-coded)
require('dotenv').config();

// Import our route files (we'll create these next)
const uploadRoutes = require('./routes/upload');
const analyzeRoutes = require('./routes/analyze');

// Create the Express application
const app = express();

// ============================================================
// MIDDLEWARE SETUP
// ============================================================
// Middleware = functions that run BETWEEN receiving a request
// and sending a response. Think of it like airport security —
// every passenger (request) goes through checkpoints before
// reaching the gate (your route handler).
// ============================================================

// 1. CORS Middleware
// When your React frontend (localhost:3000) talks to your backend
// (localhost:5000), the browser blocks it by default for security.
// CORS tells the browser "yes, this frontend is allowed to talk to us."
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// 2. JSON Body Parser
// When the frontend sends JSON data (like a job description),
// Express needs to "understand" it. This middleware converts
// the raw text stream into a JavaScript object we can use.
app.use(express.json({ limit: '10mb' }));

// 3. URL-Encoded Body Parser
// For traditional HTML form submissions
app.use(express.urlencoded({ extended: true }));

// ============================================================
// ROUTES
// ============================================================
// Routes define WHAT happens when someone visits a specific URL.
// GET  /api/health  → check if server is running
// POST /api/upload  → upload a resume PDF
// POST /api/analyze → analyze resume vs job description
// ============================================================

// Health check route — useful to confirm server is alive
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'ATS Resume Analyzer API is running!',
    timestamp: new Date().toISOString()
  });
});

// Mount our route modules
// All routes in uploadRoutes will be prefixed with /api/upload
// All routes in analyzeRoutes will be prefixed with /api/analyze
app.use('/api', uploadRoutes);
app.use('/api', analyzeRoutes);

// ============================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================
// This special middleware catches any errors that occur in routes.
// It has 4 parameters — Express identifies it as an error handler
// because of the `err` parameter as the first argument.
// ============================================================
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.message);

  // Handle Multer-specific errors (file upload errors)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Max size is 5MB.' });
  }
  if (err.message === 'Only PDF files are allowed') {
    return res.status(400).json({ error: err.message });
  }

  // Generic error response
  res.status(err.status || 500).json({
    error: err.message || 'Something went wrong on the server.'
  });
});

// 404 handler for any unmatched routes
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

// ============================================================
// START THE SERVER
// ============================================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('');
  console.log('🚀 ATS Resume Analyzer Backend Started!');
  console.log(`📡 Server running at: http://localhost:${PORT}`);
  console.log(`🔍 Health check:      http://localhost:${PORT}/api/health`);
  console.log('');
  console.log('Available Endpoints:');
  console.log(`  POST http://localhost:${PORT}/api/upload   → Upload resume PDF`);
  console.log(`  POST http://localhost:${PORT}/api/analyze  → Analyze resume vs job desc`);
  console.log('');
});

module.exports = app;
