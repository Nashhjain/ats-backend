// ============================================================
// middleware/upload.js — Multer File Upload Configuration
// ============================================================
// Multer is a Node.js middleware for handling file uploads.
// When a user submits a form with a PDF file, the browser
// sends it as "multipart/form-data" — a special format for
// binary data. Multer reads this stream and saves the file.
//
// Without Multer, reading uploaded files would require
// manually parsing the raw binary stream — very complex!
// Multer handles all of that for us.
// ============================================================

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ============================================================
// STEP 1: Configure WHERE files are stored
// ============================================================
// multer.diskStorage() lets us control the destination folder
// and the filename of each uploaded file.
// ============================================================
const storage = multer.diskStorage({

  // destination: The folder where uploaded files will be saved
  destination: (req, file, callback) => {
    const uploadDir = path.join(__dirname, '../uploads');

    // Create the uploads folder if it doesn't exist yet
    // { recursive: true } means "don't throw error if it exists"
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // callback(error, destination)
    // Pass null as error to say "no error, proceed"
    callback(null, uploadDir);
  },

  // filename: What to name the file when saved to disk
  filename: (req, file, callback) => {
    // Problem: Two users uploading "resume.pdf" would overwrite each other!
    // Solution: Add a timestamp + random number to make it unique.
    // Example: resume-1703123456789-42938475.pdf
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname); // Gets ".pdf" from "resume.pdf"
    callback(null, 'resume-' + uniqueSuffix + ext);
  }
});

// ============================================================
// STEP 2: Add a file type filter (only allow PDFs)
// ============================================================
// fileFilter runs BEFORE saving the file.
// We check if the file is a PDF, and reject it if not.
// ============================================================
const fileFilter = (req, file, callback) => {
  // Check the MIME type (the file's "type" label)
  // PDFs have MIME type: application/pdf
  if (file.mimetype === 'application/pdf') {
    callback(null, true); // Accept the file
  } else {
    // Reject the file and throw an error
    callback(new Error('Only PDF files are allowed'), false);
  }
};

// ============================================================
// STEP 3: Create and export the Multer instance
// ============================================================
const upload = multer({
  storage: storage,        // Use our custom storage config
  fileFilter: fileFilter,  // Use our file type check
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max file size (5 × 1024 × 1024 bytes)
  }
});

module.exports = upload;
