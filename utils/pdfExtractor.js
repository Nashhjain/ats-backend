const fs = require('fs');

async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);

    // This fixes the pdf-parse test file bug
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(dataBuffer, {
      max: 0 // parse all pages
    });

    const extractedText = data.text.trim();

    if (!extractedText || extractedText.length < 50) {
      throw new Error('Could not extract text. Try a different PDF.');
    }

    console.log(`✅ PDF parsed: ${data.numpages} page(s), ${extractedText.length} characters`);
    return extractedText;

  } catch (error) {
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️  Cleaned up: ${filePath}`);
    }
  } catch (err) {
    console.warn(`⚠️  Could not delete file:`, err.message);
  }
}

module.exports = { extractTextFromPDF, deleteFile };
