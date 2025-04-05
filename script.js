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
    conversationHistory.forEach(msg => {
        if (msg.role === 'system') {
            displayMessage(msg.role, msg.content, true);
        } else {
            displayMessage(msg.role, msg.content);
        }
    });
    scrollToBottom();
}

// Function to display messages
function displayMessage(role, content, isInfo = false) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    if (isInfo) {
        messageDiv.classList.add('info-message'); // Style for info messages if needed
        messageDiv.style.fontStyle = 'italic'; // Example style
        messageDiv.style.textAlign = 'center';
        messageDiv.style.color = '#666';
        messageDiv.style.alignSelf = 'center'; // Center info messages
    } else {
        messageDiv.classList.add(role === 'user' ? 'user-message' : 'ai-message');
    }
    messageDiv.textContent = content;
    chatLog.appendChild(messageDiv);
    // Ensure scroll happens *after* the message is added and potentially rendered
    setTimeout(scrollToBottom, 0);
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
    userInput.disabled = true; // Disable input while processing
    sendButton.disabled = true;
    micButton.disabled = true;

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

        const systemPrompt = `You are a helpful AI assistant embedded in a web development environment called Websim.
You can chat with the user, remember past interactions using conversation history, and potentially use local storage (though direct function calls aren't provided, you can describe what you would store/retrieve).
You have access to some project context:
Current Project ID: ${currentProject?.id || 'N/A'}
Current Project Title: ${currentProject?.title || 'N/A'}
Project Creator: @${creator?.username || 'N/A'}
Be concise, helpful, and aware of your capabilities and limitations within this environment. You cannot directly browse the web or execute code provided by the user unless specifically instructed to use an available tool (like llm-calls).`;

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
        // Ensure thinking indicator is removed on error
        const thinkingIndicator = chatLog.querySelector('.message.ai-message:last-child');
        if (thinkingIndicator && thinkingIndicator.textContent === 'Thinking...') {
            chatLog.removeChild(thinkingIndicator);
        }
        displayMessage('assistant', "Sorry, I encountered an error. Please try again.");
        scrollToBottom();
    } finally {
        // Re-enable input elements
        userInput.disabled = false;
        sendButton.disabled = false;
        micButton.disabled = false;
        userInput.focus(); // Set focus back to input
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
            userInput.value = "[Recording finished. Press Send or edit.]"; // Placeholder
            displayMessage('system', 'Recording stopped. Edit the text or press Send.', true); // Info message
            // Automatically send the placeholder text for now
            // sendMessage();
            // Or just let the user edit/confirm before sending
            userInput.focus();
            userInput.select(); // Select the placeholder text for easy replacement

            // Cleanup
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        isRecording = true;
        micButton.classList.add('recording');
        micButton.textContent = '🛑'; // Stop icon
        micButton.setAttribute('aria-label', 'Stop recording');
        userInput.placeholder = 'Recording audio...'; // Update placeholder
        userInput.disabled = true; // Disable text input while recording
        sendButton.disabled = true; // Disable send while recording

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
    micButton.setAttribute('aria-label', 'Record audio message');
    userInput.placeholder = 'Type your message or use the microphone...'; // Restore placeholder
    userInput.disabled = false; // Re-enable text input
    sendButton.disabled = false; // Re-enable send button
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