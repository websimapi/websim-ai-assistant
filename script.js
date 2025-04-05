import * as llm from "llm-calls";

const chatLog = document.getElementById('chat-log');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const micButton = document.getElementById('mic-button');

let conversationHistory = [];
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// Load conversation history from localStorage
const savedHistory = localStorage.getItem('aiConversationHistory');
if (savedHistory) {
    conversationHistory = JSON.parse(savedHistory);
    conversationHistory.forEach(msg => displayMessage(msg.role, msg.content));
    scrollToBottom();
}

// Function to display messages
function displayMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.classList.add(role === 'user' ? 'user-message' : 'ai-message');
    messageDiv.textContent = content;
    chatLog.appendChild(messageDiv);
}

// Function to scroll chat log to the bottom
function scrollToBottom() {
    chatLog.scrollTop = chatLog.scrollHeight;
}

// Function to send message to AI
async function sendMessage() {
    const userMessageContent = userInput.value.trim();
    if (!userMessageContent) return;

    displayMessage('user', userMessageContent);
    userInput.value = ''; // Clear input field

    // Add user message to history
    const newUserMessage = {
        role: "user",
        content: userMessageContent,
    };
    conversationHistory.push(newUserMessage);

    // Keep only the last N messages (e.g., 10) to manage context window
    conversationHistory = conversationHistory.slice(-10);

    try {
        // Display thinking indicator (optional)
        const thinkingMessage = document.createElement('div');
        thinkingMessage.classList.add('message', 'ai-message');
        thinkingMessage.textContent = 'Thinking...';
        chatLog.appendChild(thinkingMessage);
        scrollToBottom();

        // Get project metadata (example)
        const currentProject = await window.websim.getCurrentProject();
        const creator = await window.websim.getCreatedBy();

        const systemPrompt = `You are a helpful AI assistant.
You have access to local storage for memory and project metadata.
Current Project ID: ${currentProject?.id || 'N/A'}
Current Project Title: ${currentProject?.title || 'N/A'}
Project Creator: @${creator?.username || 'N/A'}
Use the available information and local storage (via hypothetical functions like 'saveToLocalStorage(key, value)' or 'getFromLocalStorage(key)') to assist the user. Be concise and helpful.`;


        const completion = await llm.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                ...conversationHistory,
            ],
        });

        const aiResponseContent = completion.content;

        // Remove thinking indicator
        chatLog.removeChild(thinkingMessage);

        displayMessage('assistant', aiResponseContent);

        // Add AI response to history
        conversationHistory.push(completion); // Push the full completion object

        // Save history to localStorage
        localStorage.setItem('aiConversationHistory', JSON.stringify(conversationHistory));

        scrollToBottom();

    } catch (error) {
        console.error("Error communicating with AI:", error);
        displayMessage('assistant', "Sorry, I encountered an error. Please try again.");
        // Remove thinking indicator if it exists
        const thinkingIndicator = chatLog.querySelector('.message.ai-message:last-child');
         if (thinkingIndicator && thinkingIndicator.textContent === 'Thinking...') {
              chatLog.removeChild(thinkingIndicator);
         }
        scrollToBottom();
    }
}

// Event listeners
sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

// --- Microphone Functionality ---

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); // Adjust mime type if needed
            // --- !!! IMPORTANT !!! ---
            // The 'llm-calls' library or websim environment doesn't directly support audio input yet.
            // You would typically send this audioBlob to a Speech-to-Text API.
            // For this example, we'll simulate transcription by putting a placeholder in the input.
            // Replace this with actual STT API call when available.
            console.log("Audio recorded:", audioBlob);
            userInput.value = "[Audio Input - STT Needed]"; // Placeholder
            // Automatically send the placeholder text for now
            // sendMessage();
            // Or just let the user edit/confirm before sending
             userInput.focus();


            // Cleanup
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        isRecording = true;
        micButton.classList.add('recording');
        micButton.textContent = '🛑'; // Stop icon
    } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Could not access microphone. Please ensure permission is granted.");
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    isRecording = false;
    micButton.classList.remove('recording');
    micButton.textContent = '🎤'; // Mic icon
}

micButton.addEventListener('click', () => {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
});

// Initial setup message (optional)
if (conversationHistory.length === 0) {
    displayMessage('assistant', 'Hello! How can I help you today? You can type or use the microphone.');
    scrollToBottom();
}

