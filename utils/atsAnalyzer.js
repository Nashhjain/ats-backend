// ============================================================
// utils/atsAnalyzer.js — The Core ATS Matching Engine
// ============================================================
// This is the "brain" of our system. It does 4 main things:
//   1. Preprocess text (clean + normalize)
//   2. Extract keywords from both resume and job description
//   3. Calculate a match score using cosine similarity
//   4. Identify missing skills and generate suggestions
// ============================================================

// ============================================================
// SECTION 1: COMMON WORDS TO IGNORE (Stop Words)
// ============================================================
// Words like "the", "and", "is" appear everywhere and carry
// no meaning for skill matching. We remove them so they don't
// inflate our similarity score. These are called "stop words."
// ============================================================
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','as','is','was','are','were','be','been','being','have',
  'has','had','do','does','did','will','would','could','should','may',
  'might','shall','can','need','dare','ought','used','able','i','we',
  'you','he','she','it','they','them','their','this','that','these',
  'those','my','your','our','its','who','which','what','when','where',
  'how','all','each','every','both','few','more','most','other','some',
  'such','no','not','only','same','so','than','too','very','just','also',
  'about','above','after','before','between','during','without','within',
  'through','throughout','including','across','using','based','per',
  'new','good','great','strong','excellent','experience','work','worked',
  'working','years','year','time','position','role','team','company'
]);

// ============================================================
// SECTION 2: IMPORTANT TECHNICAL SKILL PATTERNS
// ============================================================
// We boost the weight of technical terms. A phrase like
// "machine learning" should be treated as ONE skill, not two words.
// ============================================================
const MULTI_WORD_SKILLS = [
  // Programming Languages
  'node js', 'node.js', 'react js', 'react.js', 'vue js', 'angular js',
  'machine learning', 'deep learning', 'natural language processing',
  'data science', 'data analysis', 'data engineering', 'data visualization',
  'computer vision', 'neural network', 'artificial intelligence',
  // Cloud & DevOps
  'amazon web services', 'google cloud', 'microsoft azure', 'cloud computing',
  'continuous integration', 'continuous deployment', 'ci/cd',
  'version control', 'agile methodology', 'test driven development',
  // Databases
  'sql server', 'nosql', 'mongodb', 'postgresql', 'mysql', 'redis',
  // Soft Skills
  'problem solving', 'team player', 'time management', 'critical thinking',
  'communication skills', 'project management', 'cross functional'
];

// ============================================================
// SECTION 3: TEXT PREPROCESSING
// ============================================================
// Raw text from a PDF is messy: uppercase letters, punctuation,
// extra spaces, line breaks. We standardize it so that
// "JavaScript", "javascript", and "JAVASCRIPT" all become "javascript"
// and are treated as the same word.
// ============================================================

/**
 * Cleans and normalizes raw text for comparison
 * @param {string} text - Raw text input
 * @returns {string} - Cleaned, normalized text
 */
function preprocessText(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    .toLowerCase()                          // "JavaScript" → "javascript"
    .replace(/[^\w\s.+#]/g, ' ')           // Remove most punctuation (keep . + # for C#, C++, .NET)
    .replace(/\b(\w+)\s*\.\s*(\w+)\b/g, '$1.$2') // Preserve "node.js" format
    .replace(/\s+/g, ' ')                   // Multiple spaces → single space
    .trim();                                // Remove leading/trailing whitespace
}

/**
 * Tokenize text into individual words, removing stop words
 * @param {string} text - Preprocessed text
 * @returns {string[]} - Array of meaningful words/tokens
 */
function tokenize(text) {
  return text
    .split(/\s+/)                           // Split on whitespace → array of words
    .filter(word => word.length > 2)        // Remove very short words (a, is, to)
    .filter(word => !STOP_WORDS.has(word))  // Remove stop words
    .filter(word => /[a-zA-Z]/.test(word)); // Must contain at least one letter
}

// ============================================================
// SECTION 4: KEYWORD EXTRACTION
// ============================================================
// We extract both single words AND multi-word phrases.
// "machine learning" as a phrase is more valuable than
// matching "machine" and "learning" separately.
// ============================================================

/**
 * Extracts a weighted set of keywords from text
 * @param {string} text - Preprocessed text
 * @returns {Map<string, number>} - Map of keyword → frequency count
 */
function extractKeywords(text) {
  const keywordMap = new Map();

  // Step 1: Find multi-word skills first (they get higher weight)
  MULTI_WORD_SKILLS.forEach(skill => {
    if (text.includes(skill)) {
      // Count how many times this multi-word skill appears
      const regex = new RegExp(skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const count = (text.match(regex) || []).length;
      keywordMap.set(skill, count * 2); // Weight × 2 for multi-word skills
    }
  });

  // Step 2: Extract individual tokens
  const tokens = tokenize(text);
  tokens.forEach(token => {
    // Don't double-count words already captured in multi-word skills
    const alreadyCaptured = MULTI_WORD_SKILLS.some(skill => skill.includes(token) && text.includes(skill));
    if (!alreadyCaptured) {
      keywordMap.set(token, (keywordMap.get(token) || 0) + 1);
    }
  });

  return keywordMap;
}

// ============================================================
// SECTION 5: COSINE SIMILARITY CALCULATION
// ============================================================
// Cosine similarity is the gold standard for text comparison.
// It measures the "angle" between two frequency vectors.
// If they point in exactly the same direction → similarity = 1 (100%)
// If they have nothing in common → similarity = 0 (0%)
//
// VISUAL EXPLANATION:
// Imagine each document as an arrow in multi-dimensional space
// where each dimension = one unique word.
// Documents with similar words point in similar directions.
//
// MATH:
// similarity = (A · B) / (|A| × |B|)
// where A · B = sum of (frequency_in_resume × frequency_in_jobdesc)
// and |A| = square root of sum of (frequency²)
// ============================================================

/**
 * Calculates cosine similarity between two keyword maps
 * @param {Map} mapA - Keywords from resume
 * @param {Map} mapB - Keywords from job description
 * @returns {number} - Similarity score between 0 and 1
 */
function cosineSimilarity(mapA, mapB) {
  // Get all unique keywords from BOTH documents
  const allKeywords = new Set([...mapA.keys(), ...mapB.keys()]);

  let dotProduct = 0;    // A · B
  let magnitudeA = 0;    // |A|²  (we'll take √ at the end)
  let magnitudeB = 0;    // |B|²

  allKeywords.forEach(keyword => {
    const freqA = mapA.get(keyword) || 0; // frequency in resume (0 if not present)
    const freqB = mapB.get(keyword) || 0; // frequency in job desc (0 if not present)

    dotProduct += freqA * freqB;   // Multiply matching frequencies
    magnitudeA += freqA * freqA;   // Square for magnitude
    magnitudeB += freqB * freqB;
  });

  // Avoid division by zero
  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  // Cosine similarity formula
  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

// ============================================================
// SECTION 6: MISSING SKILLS DETECTION
// ============================================================
// After comparing, we identify keywords in the job description
// that are completely absent from the resume. These are the
// "gaps" the candidate should address.
// ============================================================

/**
 * Finds keywords present in job description but missing from resume
 * @param {Map} resumeKeywords - Keywords extracted from resume
 * @param {Map} jobKeywords - Keywords extracted from job description
 * @returns {string[]} - Array of missing keywords, sorted by importance
 */
function findMissingSkills(resumeKeywords, jobKeywords) {
  const missing = [];

  jobKeywords.forEach((frequency, keyword) => {
    // If the keyword appears in the job description but NOT in the resume
    if (!resumeKeywords.has(keyword)) {
      missing.push({ keyword, frequency }); // Track frequency = importance
    }
  });

  // Sort by frequency descending (most important missing skills first)
  missing.sort((a, b) => b.frequency - a.frequency);

  // Return just the keyword strings (top 20 most important)
  return missing.slice(0, 20).map(item => item.keyword);
}

// ============================================================
// SECTION 7: IMPROVEMENT SUGGESTIONS GENERATOR
// ============================================================
// Based on what's missing, we generate actionable suggestions.
// ============================================================

/**
 * Generates improvement suggestions based on missing skills
 * @param {string[]} missingSkills - Keywords missing from resume
 * @param {number} score - The current match score (0-100)
 * @returns {string[]} - List of actionable suggestions
 */
function generateSuggestions(missingSkills, score) {
  const suggestions = [];

  // General suggestions based on score range
  if (score < 30) {
    suggestions.push('⚠️ Your resume has a low match. Consider significantly tailoring it to this specific role.');
    suggestions.push('📋 Carefully re-read the job description and mirror its language in your resume.');
  } else if (score < 60) {
    suggestions.push('📈 Good start! Adding a few more relevant keywords could significantly improve your score.');
    suggestions.push('🎯 Focus your experience descriptions on accomplishments that align with the role requirements.');
  } else if (score < 80) {
    suggestions.push('✅ Strong match! Fine-tune by incorporating specific technical terms from the job description.');
  } else {
    suggestions.push('🌟 Excellent match! Your resume aligns very well with this position.');
  }

  // Specific suggestions for missing skills
  if (missingSkills.length > 0) {
    const topMissing = missingSkills.slice(0, 5);
    suggestions.push(`🔑 Consider adding these key terms to your resume: ${topMissing.join(', ')}`);
    suggestions.push('💡 Only add skills you genuinely possess — never fabricate experience.');
  }

  // Format suggestions
  suggestions.push('📝 Use bullet points starting with strong action verbs (e.g., "Developed", "Led", "Optimized").');
  suggestions.push('📊 Quantify your achievements where possible (e.g., "Improved performance by 40%").');

  // ATS-specific tips
  suggestions.push('🤖 ATS systems parse plain text — avoid tables, images, and complex formatting in your resume.');
  suggestions.push('📄 Use standard section headers: "Work Experience", "Education", "Skills".');

  return suggestions;
}

// ============================================================
// SECTION 8: MAIN ANALYZER FUNCTION
// ============================================================
// This ties everything together. Frontend calls one function,
// gets back a complete analysis result.
// ============================================================

/**
 * Main ATS Analysis Function
 * @param {string} resumeText - Raw text extracted from resume PDF
 * @param {string} jobDescription - Raw job description text from user
 * @returns {Object} - Complete analysis results
 */
function analyzeResume(resumeText, jobDescription) {
  // Step 1: Preprocess both texts
  const cleanResume = preprocessText(resumeText);
  const cleanJobDesc = preprocessText(jobDescription);

  // Step 2: Extract keywords from both
  const resumeKeywords = extractKeywords(cleanResume);
  const jobKeywords = extractKeywords(cleanJobDesc);

  // Step 3: Calculate similarity score using cosine similarity
  const rawScore = cosineSimilarity(resumeKeywords, jobKeywords);

  // Convert to percentage (0-100) and round to 1 decimal
  // We also apply a slight boost because pure cosine similarity
  // on raw text can underestimate matches
  const matchScore = Math.min(100, Math.round(rawScore * 100 * 1.8 * 10) / 10);

  // Step 4: Find missing skills
  const missingSkills = findMissingSkills(resumeKeywords, jobKeywords);

  // Step 5: Find matched skills (present in BOTH)
  const matchedSkills = [];
  jobKeywords.forEach((freq, keyword) => {
    if (resumeKeywords.has(keyword)) {
      matchedSkills.push(keyword);
    }
  });

  // Step 6: Generate improvement suggestions
  const suggestions = generateSuggestions(missingSkills, matchScore);

  // Step 7: Extract top keywords from resume (for display)
  const resumeTopKeywords = [...resumeKeywords.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);

  // Step 8: Determine overall rating label
  let rating, ratingColor;
  if (matchScore >= 80) { rating = 'Excellent Match'; ratingColor = 'green'; }
  else if (matchScore >= 60) { rating = 'Good Match'; ratingColor = 'blue'; }
  else if (matchScore >= 40) { rating = 'Fair Match'; ratingColor = 'yellow'; }
  else { rating = 'Poor Match'; ratingColor = 'red'; }

  // Return the complete analysis object
  return {
    matchScore,
    rating,
    ratingColor,
    matchedSkills: matchedSkills.slice(0, 20),    // Top 20 matched
    missingSkills: missingSkills.slice(0, 15),     // Top 15 missing
    suggestions,
    resumeKeywordCount: resumeKeywords.size,
    jobKeywordCount: jobKeywords.size,
    resumeTopKeywords,
    analysisTimestamp: new Date().toISOString()
  };
}

module.exports = { analyzeResume, preprocessText, extractKeywords };
