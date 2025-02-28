# SpeasyAI - AI-Powered Interview Assistant

SpeasyAI is a real-time interview practice tool that combines speech recognition, AI processing, and natural language understanding to help users prepare for job interviews. The application provides instant AI-generated responses to your interview questions while considering your resume context.

## Features

- 🎙️ **Real-time Speech Recognition**: Powered by Deepgram's Nova model for accurate transcription
- 🤖 **AI-Powered Responses**: Uses Groq LLM for generating contextual interview responses
- 📄 **Resume Integration**: Analyzes your resume to provide personalized responses
- 📊 **Visual Audio Feedback**: Interactive audio visualizer for speech input
- ⚡ **Smart Silence Detection**: Automatically processes responses after detecting speech pauses
- 💾 **Transcript History**: Saves all conversations for future reference
- 🎯 **Context-Aware Responses**: Tailors answers based on your resume and experience

## Prerequisites

- Node.js (v14 or higher)
- NPM or Yarn
- Deepgram API Key
- Groq API Key

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/SpeasyAI.git
cd SpeasyAI
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with your API keys:
```env
DEEPGRAM_API_KEY=your_deepgram_api_key
GROQ_API_KEY=your_groq_api_key
```

## Usage

1. Start the server:
```bash
node server.js
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

3. Upload your resume (supported format: text file)

4. Click the record button to start practicing interview questions

5. Speak your question clearly into the microphone

6. Wait for the AI to process and provide a response

7. Review your conversation history in the transcripts section

## Dependencies

- Express.js - Web application framework
- SQLite3 - Local database for storing transcripts
- Deepgram SDK - Speech-to-text processing
- Groq SDK - AI language model for response generation
- Natural - Natural language processing utilities
- Dotenv - Environment variable management

## Technical Details

- **Speech Processing**: Uses Deepgram's Nova model for accurate speech-to-text conversion
- **Database**: SQLite for storing conversation history
- **Frontend**: Vanilla JavaScript with HTML5 Canvas for audio visualization
- **Backend**: Node.js with Express
- **AI Processing**: Groq LLM for generating contextual responses
- **Resume Analysis**: Custom chunking and relevance scoring algorithm

## Error Handling

- Network error detection and recovery
- Automatic retry mechanisms
- User-friendly error messages
- Timeout handling for long-running requests
- Graceful fallbacks for API limits

## Security Features

- Temporary API key generation
- Secure environment variable handling
- Input sanitization
- Rate limiting protection

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please open an issue in the GitHub repository or contact the maintainers.

## Acknowledgments

- Deepgram for speech-to-text capabilities
- Groq for AI language model support
- All contributors and users of SpeasyAI
