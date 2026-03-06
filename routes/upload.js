// ============================================================
// routes/upload.js — File Upload API Endpoint
// ============================================================
// This file handles the POST /api/upload endpoint.
// When a user selects their PDF resume and clicks "Upload",
// the browser sends the file here. Multer processes it,
// pdf-parse extracts the text, and we store it in memory.
//
// DATA FLOW:
// Browser → POST /api/upload (multipart/form-data with PDF)
//   → Multer middleware saves file to /uploads folder
//   → Our handler reads the saved file
//   → pdf-parse extracts text from PDF
//   → We store the text in memory
//   → We respond with { success: true, sessionId, preview }
//   → Browser stores the sessionId for the next step
// ============================================================

const express = require('express');
const router = express.Router();
const path = require('path');
const upload = require('../middleware/upload');             // Our Multer config
const { extractTextFromPDF, deleteFile } = require('../utils/pdfExtractor');

// ============================================================
// IN-MEMORY SESSION STORAGE
// ============================================================
// We use a simple JavaScript Map to store extracted text
// temporarily, indexed by a session ID.
//
// In production, you'd use Redis or a database instead.
// But for learning, this is clear and simple.
//
// Map looks like: { "abc123" → { resumeText: "...", timestamp: ... } }
// ============================================================
const sessionStore = new Map();

// Export it so other route files can access the same store
module.exports.sessionStore = sessionStore;

// ============================================================
// CLEANUP: Remove old sessions every 30 minutes
// ============================================================
// If someone uploads but never analyzes, we don't want
// their data sitting in memory forever.
// ============================================================
setInterval(() => {
  const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
  sessionStore.forEach((value, key) => {
    if (value.timestamp < thirtyMinutesAgo) {
      sessionStore.delete(key);
      console.log(`🧹 Cleaned up expired session: ${key}`);
    }
  });
}, 10 * 60 * 1000); // Run every 10 minutes

// ============================================================
// POST /api/upload — Upload and Parse Resume PDF
// ============================================================
// The route uses TWO middleware functions in sequence:
//   1. upload.single('resume') → Multer saves the file
//   2. Our async function → reads + parses + responds
//
// upload.single('resume') means:
//   - Accept a SINGLE file
//   - From a form field named 'resume'
//   - After processing, attach file info to req.file
// ============================================================
router.post('/upload', upload.single('resume'), async (req, res, next) => {
  // If Multer processed the upload, req.file contains:
  //   req.file.path        → "/home/claude/ats-system/backend/uploads/resume-123.pdf"
  //   req.file.originalname → "MyResume.pdf"
  //   req.file.size        → 204800 (bytes)
  //   req.file.mimetype    → "application/pdf"

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Please select a PDF file.' });
  }

  const filePath = req.file.path;

  try {
    console.log(`📤 Resume uploaded: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);

    // Extract text from the saved PDF file
    const resumeText = await extractTextFromPDF(filePath);

    // Generate a unique session ID for this user's data
    // We combine timestamp + random number for uniqueness
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store the extracted text in our session store
    sessionStore.set(sessionId, {
      resumeText,
      originalFilename: req.file.originalname,
      timestamp: Date.now()
    });

    // Delete the PDF file from disk — we only needed the text
    deleteFile(filePath);

    // Send success response to the browser
    // The frontend will store the sessionId and use it in the next request
    res.json({
      success: true,
      sessionId,
      message: 'Resume uploaded and parsed successfully!',
      stats: {
        filename: req.file.originalname,
        characters: resumeText.length,
        words: resumeText.split(/\s+/).length,
        // Preview the first 200 characters so user knows it worked
        preview: resumeText.substring(0, 200) + (resumeText.length > 200 ? '...' : '')
      }
    });

  } catch (error) {
    // If something goes wrong, clean up the file and pass error to error handler
    deleteFile(filePath);
    next(error); // Passes to the error handling middleware in server.js
  }
});

// ============================================================
// GET /api/session/:sessionId — Check if session exists
// ============================================================
// The frontend can call this to verify the session is still active
// ============================================================
router.get('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessionStore.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired. Please re-upload your resume.' });
  }

  res.json({
    valid: true,
    filename: session.originalFilename,
    hasJobDescription: !!session.jobDescription
  });
});

module.exports = router;
module.exports.sessionStore = sessionStore;
