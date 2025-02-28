const captions = document.getElementById("captions");
const aiResponse = document.getElementById("ai-response");
const canvas = document.getElementById("audio-visualizer");
const canvasCtx = canvas.getContext("2d");
const fileUpload = document.getElementById("resume-upload");
const fileName = document.getElementById("file-name");
const recordButton = document.getElementById("record");

// Audio context and analyzer variables
let audioContext;
let analyser;
let dataArray;
let animationId;
let isRecording = false;
let transitionState = 0; // 0 = idle, 1 = recording

// Transcript and silence detection variables
let currentTranscript = "";
let lastSpeechTime = 0;
let silenceTimer = null;
const SILENCE_THRESHOLD = 2000; // 2 seconds of silence
let resumeData = null;

// Set canvas dimensions
function setupCanvas() {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}

// Initialize audio context and analyzer
function setupAudioContext() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);
}

// Draw audio visualization
function drawVisualization() {
  // Update transition state with smooth animation
  if (isRecording && transitionState < 1) {
    transitionState += 0.05;
  } else if (!isRecording && transitionState > 0) {
    transitionState -= 0.05;
  }
  
  // Clamp transition state between 0 and 1
  transitionState = Math.max(0, Math.min(1, transitionState));
  
  // Clear canvas
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (transitionState < 0.1) {
    // Almost fully in idle state
    drawIdleVisualization();
  } else if (transitionState > 0.9) {
    // Almost fully in recording state
    drawRecordingVisualization();
  } else {
    // In transition - blend between idle and recording
    drawTransitionVisualization(transitionState);
  }
  
  animationId = requestAnimationFrame(drawVisualization);
}

// Draw recording state visualization
function drawRecordingVisualization() {
  // Get frequency data
  analyser.getByteFrequencyData(dataArray);
  
  // Set visualization properties
  const barWidth = (canvas.width / dataArray.length) * 2.5;
  let barHeight;
  let x = 0;
  
  // Draw bars
  for (let i = 0; i < dataArray.length; i++) {
    barHeight = dataArray[i] * 0.5;
    
    // Create gradient
    const gradient = canvasCtx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#111111");
    gradient.addColorStop(1, "#4B5563");
    
    canvasCtx.fillStyle = gradient;
    
    // Draw rounded bars (with compatibility for browsers that don't support roundRect)
    canvasCtx.beginPath();
    if (canvasCtx.roundRect) {
      canvasCtx.roundRect(
        x, 
        canvas.height - barHeight, 
        barWidth - 2, 
        barHeight,
        5
      );
    } else {
      // Fallback for browsers that don't support roundRect
      const radius = 5;
      const barX = x;
      const barY = canvas.height - barHeight;
      const barW = barWidth - 2;
      const barH = barHeight;
      
      // Draw rounded rectangle manually
      canvasCtx.moveTo(barX + radius, barY);
      canvasCtx.lineTo(barX + barW - radius, barY);
      canvasCtx.quadraticCurveTo(barX + barW, barY, barX + barW, barY + radius);
      canvasCtx.lineTo(barX + barW, barY + barH - radius);
      canvasCtx.quadraticCurveTo(barX + barW, barY + barH, barX + barW - radius, barY + barH);
      canvasCtx.lineTo(barX + radius, barY + barH);
      canvasCtx.quadraticCurveTo(barX, barY + barH, barX, barY + barH - radius);
      canvasCtx.lineTo(barX, barY + radius);
      canvasCtx.quadraticCurveTo(barX, barY, barX + radius, barY);
    }
    canvasCtx.fill();
    
    x += barWidth;
  }
}

// Draw idle state visualization
function drawIdleVisualization() {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = 20;
  const wavesCount = 3;
  const maxRadius = Math.min(canvas.width, canvas.height) / 3;
  
  // Create pulsing effect
  const time = Date.now() * 0.001; // Convert to seconds
  const pulseScale = Math.sin(time * 2) * 0.1 + 1; // Pulsing between 0.9 and 1.1
  
  // Draw waves
  for (let i = 0; i < wavesCount; i++) {
    const currentRadius = (radius + (i * (maxRadius - radius) / wavesCount)) * pulseScale;
    const opacity = 1 - (i / wavesCount);
    
    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, currentRadius, 0, 2 * Math.PI);
    canvasCtx.strokeStyle = `rgba(17, 24, 39, ${opacity * 0.3})`;
    canvasCtx.lineWidth = 2;
    canvasCtx.stroke();
  }
  
  // Draw center circle with gradient
  const gradient = canvasCtx.createRadialGradient(
    centerX, centerY, 0,
    centerX, centerY, radius * pulseScale
  );
  gradient.addColorStop(0, 'rgba(17, 24, 39, 0.6)');
  gradient.addColorStop(1, 'rgba(17, 24, 39, 0)');
  
  canvasCtx.beginPath();
  canvasCtx.arc(centerX, centerY, radius * pulseScale, 0, 2 * Math.PI);
  canvasCtx.fillStyle = gradient;
  canvasCtx.fill();
}

// Draw transition between idle and recording states
function drawTransitionVisualization(progress) {
  // Draw a blend of both visualizations based on progress (0-1)
  
  // First, draw a faded version of the idle visualization
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = 20;
  const wavesCount = 3;
  const maxRadius = Math.min(canvas.width, canvas.height) / 3;
  
  // Create pulsing effect
  const time = Date.now() * 0.001;
  const pulseScale = Math.sin(time * 2) * 0.1 + 1;
  
  // Draw waves with reduced opacity based on transition progress
  for (let i = 0; i < wavesCount; i++) {
    const currentRadius = (radius + (i * (maxRadius - radius) / wavesCount)) * pulseScale;
    const opacity = (1 - (i / wavesCount)) * (1 - progress);
    
    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, currentRadius, 0, 2 * Math.PI);
    canvasCtx.strokeStyle = `rgba(17, 24, 39, ${opacity * 0.3})`;
    canvasCtx.lineWidth = 2;
    canvasCtx.stroke();
  }
  
  // Then, draw a partial recording visualization
  if (analyser) {
    analyser.getByteFrequencyData(dataArray);
    
    const barWidth = (canvas.width / dataArray.length) * 2.5;
    let x = 0;
    
    // Draw bars with height based on transition progress
    for (let i = 0; i < dataArray.length; i++) {
      const barHeight = dataArray[i] * 0.5 * progress;
      
      // Skip drawing very small bars
      if (barHeight < 2) {
        x += barWidth;
        continue;
      }
      
      // Create gradient
      const gradient = canvasCtx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, "#111111");
      gradient.addColorStop(1, "#4B5563");
      
      canvasCtx.fillStyle = gradient;
      
      // Draw rounded bars
      canvasCtx.beginPath();
      if (canvasCtx.roundRect) {
        canvasCtx.roundRect(
          x, 
          canvas.height - barHeight, 
          barWidth - 2, 
          barHeight,
          5
        );
      } else {
        // Fallback for browsers that don't support roundRect
        const radius = 5;
        const barX = x;
        const barY = canvas.height - barHeight;
        const barW = barWidth - 2;
        const barH = barHeight;
        
        // Draw rounded rectangle manually (simplified for small heights)
        canvasCtx.rect(barX, barY, barW, barH);
      }
      canvasCtx.fill();
      
      x += barWidth;
    }
  }
}

// Get microphone access
async function getMicrophone() {
  const userMedia = await navigator.mediaDevices.getUserMedia({
    audio: true
  });

  // Connect microphone to audio analyzer
  if (audioContext && analyser) {
    const source = audioContext.createMediaStreamSource(userMedia);
    source.connect(analyser);
  }

  return new MediaRecorder(userMedia);
}

// Open microphone and start recording
async function openMicrophone(microphone, socket) {
  await microphone.start(500);

  microphone.onstart = () => {
    console.log("client: microphone opened");
    document.body.classList.add("recording");
    isRecording = true;
    recordButton.querySelector('.record-label').textContent = "Click to stop recording";
    
    // Reset transcript for new recording session
    currentTranscript = "";
    captions.innerHTML = "<span>Listening...</span>";
    aiResponse.innerHTML = "<span class='placeholder'>AI response will appear here after you speak...</span>";
    
    // Reset silence detection
    lastSpeechTime = Date.now();
    
    // Resume audio context if suspended
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  };

  microphone.onstop = () => {
    console.log("client: microphone closed");
    document.body.classList.remove("recording");
    isRecording = false;
    recordButton.querySelector('.record-label').textContent = "Click to start recording";
    
    // Clear any pending silence timers
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    
    // If we have a transcript, process it
    if (currentTranscript.trim() !== "") {
      processTranscript(currentTranscript);
    }
  };

  microphone.ondataavailable = (e) => {
    const data = e.data;
    console.log("client: sent data to websocket");
    socket.send(data);
  };
}

// Close microphone and stop recording
async function closeMicrophone(microphone) {
  microphone.stop();
}

// Start the recording process
async function start(socket) {
  let microphoneInstance;

  console.log("client: waiting to open microphone");

  recordButton.addEventListener("click", async () => {
    if (!microphoneInstance) {
      // Check if resume is uploaded
      if (!resumeData) {
        alert("Please upload your resume first");
        return;
      }
      
      // Open and start the microphone
      microphoneInstance = await getMicrophone();
      await openMicrophone(microphoneInstance, socket);
    } else {
      // Close and stop the microphone
      await closeMicrophone(microphoneInstance);
      microphoneInstance = undefined;
    }
  });
}

// Process transcript after silence is detected
async function processTranscript(transcript) {
  console.log("Processing transcript:", transcript);
  
  try {
    // First, save transcript to database
    let saveResponse;
    try {
      saveResponse = await fetch('/save-transcript', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          transcript: transcript,
          timestamp: new Date().toISOString()
        }),
      });
    } catch (networkError) {
      console.error("Network error when saving transcript:", networkError);
      throw new Error("Network error: Could not connect to the server. Please check your internet connection.");
    }
    
    if (!saveResponse.ok) {
      const errorData = await saveResponse.json().catch(() => ({ error: `Server error: ${saveResponse.status} ${saveResponse.statusText}` }));
      console.error("Failed to save transcript:", errorData);
      throw new Error(errorData.error || "Failed to save transcript");
    }
    
    // Then, process with Groq LLM
    aiResponse.innerHTML = "<span>Processing your response...</span>";
    
    let processResponse;
    try {
      processResponse = await fetch('/process-with-groq', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          transcript: transcript,
          resume: resumeData
        }),
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });
    } catch (networkError) {
      console.error("Network error when processing with Groq:", networkError);
      if (networkError.name === 'AbortError') {
        throw new Error("Request timed out. The server took too long to respond.");
      } else {
        throw new Error("Network error: Could not connect to the server. Please check your internet connection.");
      }
    }
    
    if (!processResponse.ok) {
      let errorMessage;
      try {
        const errorData = await processResponse.json();
        console.error("Failed to process with Groq:", errorData);
        errorMessage = errorData.error || errorData.details || `Server error: ${processResponse.status} ${processResponse.statusText}`;
      } catch (jsonError) {
        console.error("Failed to parse error response:", jsonError);
        errorMessage = `Server error: ${processResponse.status} ${processResponse.statusText}`;
      }
      throw new Error(errorMessage);
    }
    
    let data;
    try {
      data = await processResponse.json();
    } catch (jsonError) {
      console.error("Failed to parse response JSON:", jsonError);
      throw new Error("Invalid response from server. Could not parse JSON.");
    }
    
    if (!data || !data.response) {
      console.error("Invalid response format:", data);
      throw new Error("Invalid response format from server.");
    }
    
    displayAIResponse(data.response);
    
  } catch (error) {
    console.error("Error in transcript processing:", error);
    
    // Create a more user-friendly error message
    let errorMessage = error.message || "An error occurred while processing your response.";
    
    // For specific error types, provide more helpful messages
    if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
      errorMessage = "Network error: Could not connect to the server. Please check your internet connection and try again.";
    } else if (errorMessage.includes("timeout")) {
      errorMessage = "The request timed out. The server might be experiencing high load. Please try again later.";
    } else if (errorMessage.includes("token limit")) {
      errorMessage = "The AI model reached its token limit. Try asking a shorter or simpler question.";
    }
    
    aiResponse.innerHTML = `<span class="error">Error: ${errorMessage}</span>`;
    
    // Add retry button
    const retryButton = document.createElement("button");
    retryButton.textContent = "Retry";
    retryButton.className = "retry-button";
    retryButton.onclick = () => processTranscript(transcript);
    aiResponse.appendChild(retryButton);
  }
}

// Display AI response with typewriter effect
function displayAIResponse(text) {
  aiResponse.innerHTML = "";
  const responseElement = document.createElement("span");
  aiResponse.appendChild(responseElement);
  
  let i = 0;
  const speed = 30; // typing speed in milliseconds
  
  function typeWriter() {
    if (i < text.length) {
      responseElement.textContent += text.charAt(i);
      i++;
      setTimeout(typeWriter, speed);
    }
  }
  
  typeWriter();
}

// Handle file upload
fileUpload.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    fileName.textContent = file.name;
    
    // Read file content
    const reader = new FileReader();
    reader.onload = (e) => {
      resumeData = e.target.result;
      console.log("Resume uploaded");
    };
    reader.readAsText(file);
  } else {
    fileName.textContent = "No file selected";
    resumeData = null;
  }
});

// Get temporary API key from server
async function getTempApiKey() {
  const result = await fetch("/key");
  const json = await result.json();
  return json.key;
}

// Handle window resize
window.addEventListener('resize', () => {
  setupCanvas();
});

// Initialize application
window.addEventListener("load", async () => {
  // Setup canvas and audio context
  setupCanvas();
  setupAudioContext();
  
  // Start visualization loop
  drawVisualization();
  
  const key = await getTempApiKey();
  const { createClient } = deepgram;
  const _deepgram = createClient(key);
  const socket = _deepgram.listen.live({ model: "nova", smart_format: true });

  socket.on("open", async () => {
    console.log("client: connected to websocket");

    socket.on("Results", (data) => {
      console.log(data);

      const transcript = data.channel.alternatives[0].transcript;

      if (transcript !== "") {
        // Accumulate transcript text
        currentTranscript += " " + transcript;
        
        // Display the current transcript
        captions.innerHTML = `<span>${currentTranscript.trim()}</span>`;
        
        // Update last speech time for silence detection
        lastSpeechTime = Date.now();
        
        // Clear any existing silence timer
        if (silenceTimer) {
          clearTimeout(silenceTimer);
        }
        
        // Set a new silence timer
        silenceTimer = setTimeout(() => {
          // If we're still recording and have transcript content
          if (isRecording && currentTranscript.trim() !== "") {
            console.log("Silence detected for 2 seconds, processing transcript");
            processTranscript(currentTranscript);
            
            // Reset transcript after processing
            currentTranscript = "";
            captions.innerHTML = "<span>Listening...</span>";
          }
        }, SILENCE_THRESHOLD);
      }
    });

    socket.on("error", (e) => console.error(e));

    socket.on("warning", (e) => console.warn(e));

    socket.on("Metadata", (e) => console.log(e));

    socket.on("close", (e) => console.log(e));

    await start(socket);
  });
});
