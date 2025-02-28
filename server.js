const express = require("express");
const http = require("http");
const { createClient } = require("@deepgram/sdk");
const dotenv = require("dotenv");
const sqlite3 = require('sqlite3').verbose();
const path = require("path");
const Groq = require("groq-sdk");
const natural = require('natural');
dotenv.config();

// Initialize Groq client
const groqClient = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const client = createClient(process.env.DEEPGRAM_API_KEY);

const app = express();
const server = http.createServer(app);

// Middleware to parse JSON requests
app.use(express.json({ limit: '50mb' }));
app.use(express.static("public/"));

// Simple in-memory store for resume chunks
let resumeChunks = [];
let isResumeProcessed = false;

// Function to estimate token count (rough approximation)
function estimateTokenCount(text) {
     return Math.ceil(text.length / 4);
}

// Function to chunk the resume into smaller pieces
function chunkResume(resume, chunkSize = 400) {
     const tokenizer = new natural.SentenceTokenizer();
  const sentences = tokenizer.tokenize(resume);
  
  const chunks = [];
  let currentChunk = "";
  
  for (const sentence of sentences) {
         if (currentChunk.length + sentence.length > chunkSize) {
      chunks.push(currentChunk);
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }
  
     if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks.map((text, index) => ({
    id: index,
    text,
         keywords: text.toLowerCase().split(/\W+/).filter(word => 
      word.length > 3 && !["with", "that", "this", "have", "from", "were", "what"].includes(word)
    ),
         tokenCount: estimateTokenCount(text)
  }));
}

// Function to find relevant chunks based on a query
function findRelevantChunks(query, chunks, maxChunks = 3) {
     const queryText = query.toLowerCase();
  const queryWords = queryText.split(/\W+/).filter(word => 
    word.length > 3 && !["with", "that", "this", "have", "from", "were", "what"].includes(word)
  );
  
     const experienceKeywords = ['experience', 'background', 'work', 'job', 'career', 'role', 'position', 'project', 'achievement', 'accomplishment', 'responsibility', 'duty', 'task', 'skill', 'expertise'];
  const isExperienceQuestion = experienceKeywords.some(keyword => queryText.includes(keyword));
  
     const keyPhrases = [];
  for (let i = 0; i < queryWords.length - 1; i++) {
    keyPhrases.push(queryWords[i] + " " + queryWords[i + 1]);
    if (i < queryWords.length - 2) {
      keyPhrases.push(queryWords[i] + " " + queryWords[i + 1] + " " + queryWords[i + 2]);
    }
  }
  
     const scoredChunks = chunks.map(chunk => {
    const chunkText = chunk.text.toLowerCase();
    let score = 0;
    
         if (isExperienceQuestion && chunk.isExperienceSection) {
      score += 50;      }
    
         for (const word of queryWords) {
             const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
      if (wordRegex.test(chunkText)) {
        score += 5;        } else if (chunkText.includes(word)) {
        score += 2;        }
      
             if (chunk.keywords.includes(word)) {
        score += 1;
      }
    }
    
         for (const phrase of keyPhrases) {
      if (chunkText.includes(phrase)) {
        score += 10;        }
    }
    
         if (isExperienceQuestion) {
      for (const expKeyword of experienceKeywords) {
        if (chunkText.includes(expKeyword)) {
          score += 8;          }
      }
      
             if (/\b(20\d\d|19\d\d)\b/.test(chunkText) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(chunkText)) {
        score += 5;        }
      
             if (/\b(company|organization|corporation|inc|llc|ltd|group)\b/i.test(chunkText)) {
        score += 5;        }
    }
    
         if (chunk.text.length < 300) {
      score += 1;
    }
    
    return { ...chunk, score };
  });
  
     const relevantChunks = scoredChunks.filter(chunk => chunk.score > 0);
  
     if (relevantChunks.length === 0) {
    console.log("No relevant chunks found, using first chunks as fallback");
    return chunks.slice(0, maxChunks).map(chunk => chunk.text);
  }
  
     if (isExperienceQuestion) {
    const experienceChunks = relevantChunks.filter(chunk => chunk.isExperienceSection);
    const nonExperienceChunks = relevantChunks.filter(chunk => !chunk.isExperienceSection);
    
    if (experienceChunks.length > 0) {
             experienceChunks.sort((a, b) => b.score - a.score);
      nonExperienceChunks.sort((a, b) => b.score - a.score);
      
             const result = [];
      result.push(...experienceChunks.slice(0, Math.min(2, experienceChunks.length)));
      
             const remainingSlots = maxChunks - result.length;
      if (remainingSlots > 0 && nonExperienceChunks.length > 0) {
        result.push(...nonExperienceChunks.slice(0, remainingSlots));
      }
      
      return result.map(chunk => chunk.text);
    }
  }
  
     return relevantChunks
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks)
    .map(chunk => chunk.text);
}

// Process the resume once
function processResume(resume) {
  if (!resume || isResumeProcessed) return;
  
  console.log("Processing resume for RAG...");
  
     const experienceSections = extractExperienceSections(resume);
  
     resumeChunks = chunkResume(resume);
  
     if (experienceSections.length > 0) {
    console.log(`Identified ${experienceSections.length} experience sections in resume`);
    
         for (const chunk of resumeChunks) {
      for (const section of experienceSections) {
        if (section.includes(chunk.text) || chunk.text.includes(section)) {
          chunk.isExperienceSection = true;
                     chunk.keywords = [...new Set([...chunk.keywords, 'experience', 'work', 'job', 'role', 'position'])];
          break;
        }
      }
    }
  }
  
  isResumeProcessed = true;
  console.log(`Resume processed into ${resumeChunks.length} chunks`);
}

// Function to extract experience sections from a resume
function extractExperienceSections(resume) {
  const sections = [];
  
     const experienceHeaders = [
    /\bwork experience\b/i,
    /\bprofessional experience\b/i,
    /\bemployment history\b/i,
    /\bwork history\b/i,
    /\bexperience\b/i,
    /\bemployment\b/i,
    /\bcareer history\b/i,
    /\bprofessional background\b/i
  ];
  
     const otherSectionHeaders = [
    /\beducation\b/i,
    /\bskills\b/i,
    /\bcertifications\b/i,
    /\bawards\b/i,
    /\bprojects\b/i,
    /\bvolunteer\b/i,
    /\blanguages\b/i,
    /\binterests\b/i,
    /\breferences\b/i,
    /\bpublications\b/i
  ];
  
     const lines = resume.split('\n');
  
  let inExperienceSection = false;
  let currentSection = '';
  let sectionStartIndex = -1;
  
     for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
         if (!line) continue;
    
         const isExperienceHeader = experienceHeaders.some(regex => regex.test(line));
    
         const isOtherHeader = otherSectionHeaders.some(regex => regex.test(line));
    
    if (isExperienceHeader) {
             if (inExperienceSection && currentSection) {
        sections.push(currentSection);
      }
      
             inExperienceSection = true;
      currentSection = line;
      sectionStartIndex = i;
    } 
    else if (inExperienceSection && isOtherHeader) {
             sections.push(currentSection);
      inExperienceSection = false;
      currentSection = '';
    }
    else if (inExperienceSection) {
             currentSection += '\n' + line;
      
             const hasDatePattern = /\b(20\d\d|19\d\d)\b/.test(line) || 
                            /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(line);
      
             const hasCompanyIndicator = /\b(company|organization|corporation|inc|llc|ltd|group)\b/i.test(line);
      
                    if (i - sectionStartIndex > 5 && !hasDatePattern && !hasCompanyIndicator && !currentSection.match(/\b(20\d\d|19\d\d)\b/)) {
        inExperienceSection = false;
        currentSection = '';
      }
    }
  }
  
     if (inExperienceSection && currentSection) {
    sections.push(currentSection);
  }
  
        if (sections.length === 0) {
    const workRelatedTerms = ['worked', 'developed', 'managed', 'led', 'created', 'implemented', 'designed', 'built'];
    let potentialExperienceText = '';
    let inPotentialExperience = false;
    
    for (const line of lines) {
      const containsWorkTerm = workRelatedTerms.some(term => line.toLowerCase().includes(term));
      const containsDatePattern = /\b(20\d\d|19\d\d)\b/.test(line);
      
      if (containsWorkTerm || containsDatePattern) {
        inPotentialExperience = true;
        potentialExperienceText += line + '\n';
      } else if (inPotentialExperience) {
                 potentialExperienceText += line + '\n';
        
                 if (potentialExperienceText.split('\n').length > 5) {
          inPotentialExperience = false;
          if (potentialExperienceText.trim()) {
            sections.push(potentialExperienceText.trim());
          }
          potentialExperienceText = '';
        }
      }
    }
    
         if (potentialExperienceText.trim()) {
      sections.push(potentialExperienceText.trim());
    }
  }
  
  return sections;
}

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// Initialize SQLite database
const dbPath = path.join(__dirname, 'transcripts.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database');
    
         db.run(`CREATE TABLE IF NOT EXISTS transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transcript TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )`, (err) => {
      if (err) {
        console.error('Error creating table', err.message);
      } else {
        console.log('Transcripts table ready');
      }
    });
  }
});

// Endpoint to save transcript to SQLite database
app.post("/save-transcript", async (req, res) => {
  try {
    const { transcript, timestamp } = req.body;
    
    if (!transcript) {
      return res.status(400).json({ error: "Transcript is required" });
    }
    
    const currentTimestamp = timestamp || new Date().toISOString();
    
         const sql = `INSERT INTO transcripts (transcript, timestamp) VALUES (?, ?)`;
    db.run(sql, [transcript, currentTimestamp], function(err) {
      if (err) {
        console.error("Database error:", err.message);
        return res.status(500).json({ error: "Failed to save transcript to database" });
      }
      
      console.log(`Transcript saved with ID: ${this.lastID}`);
      res.status(200).json({ 
        success: true, 
        message: "Transcript saved successfully",
        id: this.lastID
      });
    });
  } catch (error) {
    console.error("Error saving transcript:", error);
    res.status(500).json({ error: "Failed to save transcript" });
  }
});

// Process transcript with Groq LLM
app.post("/process-with-groq", async (req, res) => {
  try {
    const { transcript, resume } = req.body;
    
    if (!transcript) {
      return res.status(400).json({ error: "Transcript is required" });
    }
    
    console.log("Processing transcript:", transcript);
    
         if (resume && !isResumeProcessed) {
      processResume(resume);
    }
    
         const experienceKeywords = ['experience', 'background', 'work', 'job', 'career', 'role', 'position', 'project', 'achievement', 'accomplishment', 'responsibility', 'duty', 'task', 'skill', 'expertise'];
    const isExperienceQuestion = experienceKeywords.some(keyword => transcript.toLowerCase().includes(keyword));
    
         let relevantResumeContent = "";
    let totalTokens = 0;
    const MAX_SYSTEM_TOKENS = 1500;      const MAX_CHUNKS = isExperienceQuestion ? 3 : 2;      
    if (isResumeProcessed && resumeChunks.length > 0) {
             const relevantChunks = findRelevantChunks(transcript, resumeChunks, MAX_CHUNKS);
      
             const baseSystemPrompt = "You are an AI interview assistant helping a job candidate respond to interview questions. Provide thoughtful, concise, and professional responses that highlight relevant skills and experiences. Be specific and use examples when possible. Keep responses under 200 words.";
      const baseTokenCount = estimateTokenCount(baseSystemPrompt);
      
             const userPrompt = `The interviewer asked: "${transcript}"\n\nPlease provide a strong response as the job candidate.`;
      const userTokenCount = estimateTokenCount(userPrompt);
      
             const availableTokens = MAX_SYSTEM_TOKENS - baseTokenCount;
      
             let usedTokens = 0;
      const usableChunks = [];
      
      for (const chunk of relevantChunks) {
        const chunkTokens = estimateTokenCount(chunk);
        if (usedTokens + chunkTokens <= availableTokens) {
          usableChunks.push(chunk);
          usedTokens += chunkTokens;
        } else {
                     if (usableChunks.length === 0) {
                         const availableChars = availableTokens * 4;              const truncatedChunk = chunk.substring(0, availableChars - 20) + "...";              usableChunks.push(truncatedChunk);
          }
          break;
        }
      }
      
      relevantResumeContent = usableChunks.join("\n\n");
      totalTokens = baseTokenCount + usedTokens + userTokenCount;
      
      console.log(`Found ${relevantChunks.length} relevant chunks, using ${usableChunks.length} chunks within token limit`);
      console.log(`Estimated total tokens: ${totalTokens} (system: ${baseTokenCount + usedTokens}, user: ${userTokenCount})`);
    }
    
         let systemPrompt = "You are an AI interview assistant helping a job candidate respond to interview questions. ";
    
    if (relevantResumeContent) {
      if (isExperienceQuestion) {
        systemPrompt += "IMPORTANT: The following question is about the candidate's experience. You MUST ONLY use the information from the resume sections below to answer. DO NOT make up or generate any experience that is not explicitly mentioned in these resume sections:\n\n" + relevantResumeContent;
      } else {
        systemPrompt += "Here are relevant sections from the candidate's resume that you should use to provide information when answering questions:\n\n" + relevantResumeContent;
      }
    } else {
      systemPrompt += "You should respond as a strong candidate with relevant experience in the field.";
    }
    
    systemPrompt += "\n\nProvide thoughtful, concise, and professional responses that highlight relevant skills and experiences. Be specific and use examples when possible. Keep responses under 200 words.";
    
         if (isExperienceQuestion) {
      systemPrompt += "\n\nREMINDER: Only mention experience that is explicitly stated in the resume sections provided above. Do not invent or generate any additional experience.";
    }
    
         const userPrompt = `The interviewer asked: "${transcript}"\n\nPlease provide a strong response as the job candidate.`;
    
         if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY is not set in environment variables");
      return res.status(500).json({ error: "API key configuration error" });
    }
    
    try {
      console.log("Calling Groq API...");
      
             const chatCompletion = await groqClient.chat.completions.create({
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 500,
      });
      
             if (!chatCompletion || !chatCompletion.choices || !chatCompletion.choices[0] || !chatCompletion.choices[0].message) {
        console.error("Invalid response from Groq API:", JSON.stringify(chatCompletion));
        throw new Error("Invalid response structure from Groq API");
      }
      
             const response = chatCompletion.choices[0].message.content;
      
      if (!response) {
        console.error("Empty response content from Groq API");
        throw new Error("Empty response from Groq API");
      }
      
      console.log("Received valid response from Groq API");
      
             const sql = `INSERT INTO transcripts (transcript, timestamp) VALUES (?, ?)`;
      db.run(sql, ["AI RESPONSE: " + response, new Date().toISOString()], function(err) {
        if (err) {
          console.error("Database error when saving AI response:", err.message);
        } else {
          console.log(`AI response saved with ID: ${this.lastID}`);
        }
      });
      
      return res.status(200).json({ response });
    } catch (groqError) {
      console.error("Groq API Error:", groqError);
      
             if (groqError.response && groqError.response.data) {
        console.error("Groq API Error Details:", groqError.response.data);
      }
      
             const errorMessage = groqError.message || '';
      const isTokenLimitError = errorMessage.toLowerCase().includes('token') && 
                               (errorMessage.toLowerCase().includes('limit') || 
                                errorMessage.toLowerCase().includes('exceed'));
      
      if (isTokenLimitError) {
        console.error("Token limit exceeded. Retrying with smaller context...");
        
        try {
                     let fallbackSystemPrompt = "You are an AI interview assistant helping a job candidate respond to interview questions. Provide a professional response based on general knowledge.";
          
                     if (isExperienceQuestion && relevantResumeContent) {
                         const firstChunk = relevantResumeContent.split('\n\n')[0];
            fallbackSystemPrompt = "You are an AI interview assistant helping a job candidate respond to interview questions about their experience. ONLY use the following resume excerpt and DO NOT invent any additional experience: \n\n" + firstChunk;
          }
          
          console.log("Attempting fallback Groq API call with smaller prompt...");
          
          const fallbackCompletion = await groqClient.chat.completions.create({
            messages: [
              {
                role: "system",
                content: fallbackSystemPrompt
              },
              {
                role: "user",
                content: userPrompt
              }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
            max_tokens: 500,
          });
          
                     if (!fallbackCompletion || !fallbackCompletion.choices || !fallbackCompletion.choices[0] || !fallbackCompletion.choices[0].message) {
            console.error("Invalid fallback response from Groq API:", JSON.stringify(fallbackCompletion));
            throw new Error("Invalid fallback response structure from Groq API");
          }
          
          const fallbackResponse = fallbackCompletion.choices[0].message.content;
          
          if (!fallbackResponse) {
            console.error("Empty fallback response content from Groq API");
            throw new Error("Empty fallback response from Groq API");
          }
          
          console.log("Received valid fallback response from Groq API");
          
                     const sql = `INSERT INTO transcripts (transcript, timestamp) VALUES (?, ?)`;
          db.run(sql, ["AI FALLBACK RESPONSE (TOKEN LIMIT): " + fallbackResponse, new Date().toISOString()]);
          
          return res.status(200).json({ response: fallbackResponse });
        } catch (fallbackError) {
          console.error("Even fallback request failed:", fallbackError);
                   }
      }
      
             console.log("Falling back to enhanced mock response");
      let response;
      
             if (isExperienceQuestion) {
        if (relevantResumeContent) {
                     response = "Based on my resume, I have relevant experience in this field. I've worked on various projects that have helped me develop the skills needed for this role. I'd be happy to discuss specific aspects of my experience in more detail if you're interested in particular areas.";
        } else {
          response = "I have experience that aligns well with this role, though I'd prefer to discuss the specific details in our conversation rather than providing a generic overview. Could you let me know which aspects of my experience you're most interested in learning about?";
        }
      }
             else if (transcript.toLowerCase().includes("python") || transcript.toLowerCase().includes("programming language")) {
        response = "I have experience with Python programming. I've used it for data analysis, web development with Flask and Django, and automation tasks. In my previous role, I developed a Python-based ETL pipeline that processed over 1 million records daily with 99.9% accuracy. I'm also familiar with Python libraries like Pandas, NumPy, and Scikit-learn for data science applications.";
      } else if (transcript.toLowerCase().includes("background")) {
                 response = "I have a background in software development with experience in building web applications and data processing systems. I've worked in both startup and enterprise environments, which has given me a versatile perspective on development practices. I believe my background has prepared me well for this role, and I'm excited about the opportunity to contribute to your team.";
      } else if (transcript.toLowerCase().includes("skill") || transcript.toLowerCase().includes("technology")) {
        response = "My technical skills include proficiency in JavaScript, Python, React, and Node.js. I'm experienced with cloud platforms like AWS and have implemented CI/CD pipelines using GitHub Actions and Jenkins. I've also worked extensively with databases including PostgreSQL and MongoDB. In my previous role, I implemented a microservices architecture that improved our system scalability by 60%.";
      } else if (transcript.toLowerCase().includes("challenge") || transcript.toLowerCase().includes("problem")) {
        response = "One significant challenge I faced was when our user base suddenly grew by 300% after a product launch. Our existing architecture couldn't handle the load, resulting in frequent outages. I led a cross-functional team to redesign our backend, implementing caching strategies, database optimizations, and horizontal scaling. We achieved a 70% improvement in response times while maintaining 99.9% uptime during peak loads.";
      } else if (transcript.toLowerCase().includes("team") || transcript.toLowerCase().includes("collaborate")) {
        response = "I thrive in collaborative environments and have experience working in cross-functional teams. In my last position, I coordinated with designers, product managers, and other developers to deliver a complex feature on a tight deadline. I facilitated daily stand-ups and created documentation that improved our team's communication efficiency by 30%. I believe in open communication and constructive feedback to build strong team relationships.";
      } else if (transcript.toLowerCase().includes("cuda") || transcript.toLowerCase().includes("gpu")) {
        response = "I have experience with CUDA programming for GPU acceleration. I've implemented parallel computing solutions that leveraged NVIDIA GPUs to speed up machine learning model training by 5x compared to CPU-only implementations. I've also optimized memory usage patterns to maximize throughput on GPU hardware, which was critical for our real-time data processing pipeline.";
      } else {
        response = "Thank you for that question. Based on my experience, I believe I'm well-suited for this position. In my previous roles, I've developed a strong foundation in software engineering best practices, from designing scalable architectures to implementing efficient algorithms. I'm particularly proud of a recent project where I improved application performance by 50% through code optimization and architectural improvements. I'm always eager to learn new technologies and adapt to changing requirements. Could you tell me more about the specific challenges your team is currently facing?";
      }
      
             const sql = `INSERT INTO transcripts (transcript, timestamp) VALUES (?, ?)`;
      db.run(sql, ["AI FALLBACK RESPONSE: " + response, new Date().toISOString()], function(err) {
        if (err) {
          console.error("Database error when saving fallback response:", err.message);
        } else {
          console.log(`Fallback response saved with ID: ${this.lastID}`);
        }
      });
      
      return res.status(200).json({ response });
    }
  } catch (error) {
    console.error("Unhandled error in process-with-groq endpoint:", error);
    return res.status(500).json({ error: "Failed to process with Groq LLM", details: error.message });
  }
});

// Endpoint to get all transcripts
app.get("/transcripts", (req, res) => {
  db.all(`SELECT * FROM transcripts ORDER BY timestamp DESC`, [], (err, rows) => {
    if (err) {
      console.error("Error fetching transcripts:", err.message);
      return res.status(500).json({ error: "Failed to fetch transcripts" });
    }
    
    res.status(200).json(rows);
  });
});

const getProjectId = async () => {
  const { result, error } = await client.manage.getProjects();

  if (error) {
    throw error;
  }

  return result.projects[0].project_id;
};

const getTempApiKey = async (projectId) => {
  const { result, error } = await client.manage.createProjectKey(projectId, {
    comment: "short lived",
    scopes: ["usage:write"],
    time_to_live_in_seconds: 20,
  });

  if (error) {
    throw error;
  }

  return result;
};

app.get("/key", async (req, res) => {
  try {
    const projectId = await getProjectId();
    const key = await getTempApiKey(projectId);
    res.json(key);
  } catch (error) {
    console.error("Error getting API key:", error);
    res.status(500).json({ error: "Failed to get API key" });
  }
});

// Graceful shutdown to close database connection
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Database connection closed');
    process.exit(0);
  });
});

server.listen(3000, () => {
  console.log("listening on http://localhost:3000");
});

