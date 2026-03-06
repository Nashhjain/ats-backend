// ============================================================
// routes/analyze.js — Resume Analysis API Endpoint
// ============================================================
// This file handles the POST /api/analyze endpoint.
// After the user uploads their resume (step 1), they paste
// a job description and click "Analyze". That request comes here.
//
// DATA FLOW:
// Browser → POST /api/analyze (JSON body: { sessionId, jobDescription })
//   → We look up the sessionId in our memory store
//   → We retrieve the previously extracted resume text
//   → We run the ATS analysis algorithm
//   → We respond with { matchScore, missingSkills, suggestions... }
//   → Browser displays the results dashboard
// ============================================================

const express = require('express');
const router = express.Router();

// Import the ATS analysis engine we built
const { analyzeResume } = require('../utils/atsAnalyzer');

// Import the shared session store from the upload route
// Both files share the same Map object stored in memory
const uploadRouter = require('./upload');
const sessionStore = uploadRouter.sessionStore;

// ============================================================
// POST /api/analyze — Analyze Resume Against Job Description
// ============================================================
// Request body (JSON) should contain:
//   {
//     "sessionId": "session_1703123456789_abc123",
//     "jobDescription": "We are looking for a React developer..."
//   }
//
// How JSON communication works:
// 1. Frontend creates a JavaScript object: { sessionId: "...", jobDescription: "..." }
// 2. JSON.stringify() converts it to a text string: '{"sessionId":"...","jobDescription":"..."}'
// 3. That string is sent in the HTTP request body with Content-Type: application/json
// 4. Express's app.use(express.json()) middleware parses it back into a JS object
// 5. We access it via req.body.sessionId and req.body.jobDescription
// ============================================================
router.post('/analyze', async (req, res, next) => {
  try {
    const { sessionId, jobDescription } = req.body;

    // ---- Input Validation ----
    // Always validate inputs before processing!
    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required. Please upload your resume first.'
      });
    }

    if (!jobDescription || jobDescription.trim().length < 50) {
      return res.status(400).json({
        error: 'Job description is too short. Please paste the full job description (at least 50 characters).'
      });
    }

    // ---- Retrieve Session Data ----
    const session = sessionStore.get(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session expired or not found. Please re-upload your resume and try again.',
        code: 'SESSION_EXPIRED'
      });
    }

    const { resumeText } = session;
    const cleanJobDesc = jobDescription.trim();

    console.log(`🔍 Starting ATS analysis...`);
    console.log(`   Resume length: ${resumeText.length} characters`);
    console.log(`   Job desc length: ${cleanJobDesc.length} characters`);

    // ---- Run ATS Analysis ----
    // This is where the magic happens — our analyzer processes both texts
    const startTime = Date.now();
    const results = analyzeResume(resumeText, cleanJobDesc);
    const processingTime = Date.now() - startTime;

    console.log(`✅ Analysis complete in ${processingTime}ms. Score: ${results.matchScore}%`);

    // ---- Update Session with Job Description ----
    // Store it so the user can re-analyze without re-uploading
    sessionStore.set(sessionId, {
      ...session,                        // Keep existing session data (resumeText, filename)
      jobDescription: cleanJobDesc,      // Add the job description
      lastAnalyzed: new Date().toISOString()
    });

    // ---- Send Response ----
    // The frontend will receive this JSON and render the results
    res.json({
      success: true,
      data: {
        ...results,
        processingTimeMs: processingTime,
        resumeFilename: session.originalFilename
      }
    });

  } catch (error) {
    next(error);
  }
});

// ============================================================
// POST /api/analyze/demo — Demo analysis with sample data
// ============================================================
// Useful for testing the frontend without having a real PDF
// ============================================================
router.post('/analyze/demo', (req, res) => {
  const { analyzeResume } = require('../utils/atsAnalyzer');

  const sampleResume = `
    John Smith
    Software Engineer | john@email.com | (555) 123-4567
    
    EXPERIENCE
    Senior Software Engineer — TechCorp (2020-2024)
    - Developed scalable REST APIs using Node.js and Express
    - Built responsive React applications with TypeScript
    - Implemented CI/CD pipelines using GitHub Actions and Docker
    - Optimized PostgreSQL database queries, improving performance by 40%
    - Collaborated with cross-functional teams in an Agile environment
    
    Software Engineer — StartupXYZ (2018-2020)
    - Built Python Flask microservices deployed on AWS
    - Developed automated testing suites with Jest and Pytest
    - Worked with MongoDB and Redis for caching
    
    SKILLS
    JavaScript, TypeScript, Python, Node.js, React, Express, Flask
    PostgreSQL, MongoDB, Redis, Docker, Kubernetes, AWS, Git
    REST APIs, GraphQL, CI/CD, Agile, Microservices
    
    EDUCATION
    B.S. Computer Science — State University (2018)
  `;

  const sampleJobDesc = `
    Senior Full Stack Developer
    
    We are looking for an experienced Full Stack Developer to join our team.
    
    Requirements:
    - 4+ years of experience with React.js and Node.js
    - Proficiency in TypeScript and modern JavaScript (ES6+)
    - Experience with RESTful APIs and GraphQL
    - Strong knowledge of SQL databases (PostgreSQL preferred)
    - Experience with cloud platforms (AWS or GCP)
    - Familiarity with Docker and container orchestration
    - Experience with CI/CD pipelines
    - Knowledge of Agile/Scrum methodology
    
    Nice to have:
    - Experience with Kubernetes
    - Knowledge of Redis for caching
    - Contributions to open source projects
    - Experience with machine learning or data science
  `;

  const results = analyzeResume(sampleResume, sampleJobDesc);

  res.json({
    success: true,
    isDemo: true,
    data: {
      ...results,
      resumeFilename: 'sample-resume.pdf'
    }
  });
});

module.exports = router;
