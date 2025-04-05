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
    try {
        conversationHistory = JSON.parse(savedHistory);
        // Filter out any potential non-message objects just in case
        conversationHistory = conversationHistory.filter(msg => msg && msg.role && typeof msg.content === 'string');
        conversationHistory.forEach(msg => {
            // Don't display system messages loaded from history
            if (msg.role !== 'system') {
                 displayMessage(msg.role, msg.content);
            }
        });
        // Ensure initial scroll works after loading history
        setTimeout(scrollToBottom, 0);
    } catch (e) {
        console.error("Error parsing conversation history:", e);
        localStorage.removeItem('aiConversationHistory'); // Clear corrupted history
        conversationHistory = []; // Reset history
        displayMessage('assistant', 'Hello! How can I help you today? You can type or use the microphone.');
        scrollToBottom();
    }

} else {
     // Initial setup message only if no history is loaded
     displayMessage('assistant', 'Hello! How can I help you today? You can type or use the microphone.');
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
    } else if (role === 'user') {
         messageDiv.classList.add('user-message');
    } else if (role === 'assistant') {
         messageDiv.classList.add('ai-message');
    } else {
        // Handle potential unknown roles or system messages if needed, or ignore
        console.warn("Displaying message with unexpected role:", role);
        messageDiv.classList.add('ai-message'); // Default to AI style for now
    }
    messageDiv.textContent = content;
    chatLog.appendChild(messageDiv);
    // Ensure scroll happens *after* the message is added and potentially rendered
    setTimeout(scrollToBottom, 0);
}

// Function to scroll chat log to the bottom
function scrollToBottom() {
    // Adding a small delay can sometimes help ensure layout is complete
    setTimeout(() => {
        chatLog.scrollTop = chatLog.scrollHeight;
    }, 50);
}

// Function to send message to AI
async function sendMessage() {
    const userMessageContent = userInput.value.trim();
    if (!userMessageContent || isRecording) return; // Also prevent sending while recording

    displayMessage('user', userMessageContent);
    const currentUserInput = userInput.value; // Store current input before clearing
    userInput.value = ''; // Clear input field immediately
    userInput.disabled = true; // Disable input while processing
    sendButton.disabled = true;
    micButton.disabled = true;

    // Add user message to history
    const newUserMessage = {
        role: "user",
        content: userMessageContent,
    };
    conversationHistory.push(newUserMessage);

    // Keep only the last N messages (e.g., 10) + potentially the system prompt
    // Filter out old system messages before slicing user/assistant pairs
    let relevantHistory = conversationHistory.filter(msg => msg.role !== 'system');
    relevantHistory = relevantHistory.slice(-10); // Keep last 10 user/assistant messages


    // Display thinking indicator (optional)
    const thinkingMessage = document.createElement('div');
    thinkingMessage.classList.add('message', 'ai-message');
    thinkingMessage.textContent = 'Thinking...';
    chatLog.appendChild(thinkingMessage);
    scrollToBottom();

    try {
        // Get project metadata (example) - wrap in try/catch in case websim fails
        let currentProject, creator;
        try {
            currentProject = await window.websim.getCurrentProject();
            creator = await window.websim.getCreatedBy();
        } catch (websimError) {
            console.error("Error getting websim context:", websimError);
            // Decide if you want to proceed without context or show an error
        }


        const systemPrompt = `You are a helpful AI assistant embedded in a web development environment called Websim.
You can chat with the user, remember past interactions using conversation history, and potentially use local storage (though direct function calls aren't provided, you can describe what you would store/retrieve).
You have access to some project context:
Current Project ID: ${currentProject?.id || 'N/A'}
Current Project Title: ${currentProject?.title || 'N/A'}
Project Creator: @${creator?.username || 'N/A'}
Be concise, helpful, and aware of your capabilities and limitations within this environment. You cannot directly browse the web or execute code provided by the user unless specifically instructed to use an available tool (like llm-calls).`;

        console.log("Sending to LLM:", { systemPrompt, relevantHistory }); // Log what's being sent

        const completion = await llm.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                ...relevantHistory, // Send the sliced history
            ],
        });

        console.log("Received from LLM:", completion); // Log the response

        const aiResponseContent = completion.content;

        // Remove thinking indicator
        if (chatLog.contains(thinkingMessage)) {
             chatLog.removeChild(thinkingMessage);
        }


        if (aiResponseContent) {
            displayMessage('assistant', aiResponseContent);

            // Add AI response to history - Use standard format
            conversationHistory.push({ role: 'assistant', content: aiResponseContent });

            // Save updated history (including the new user and AI message)
            // Ensure history doesn't contain non-standard objects before saving
            const historyToSave = conversationHistory.filter(msg => msg && msg.role && typeof msg.content === 'string');
            localStorage.setItem('aiConversationHistory', JSON.stringify(historyToSave));

            scrollToBottom();
        } else {
             console.error("LLM response content was empty or invalid:", completion);
             displayMessage('assistant', "Sorry, I received an empty response. Please try again.");
             scrollToBottom();
             // Restore user input if AI fails but user message was valid
             userInput.value = currentUserInput;
        }


    } catch (error) {
        console.error("Error communicating with AI:", error);
         // Ensure thinking indicator is removed on error
        if (chatLog.contains(thinkingMessage)) {
            chatLog.removeChild(thinkingMessage);
        }
        displayMessage('assistant', "Sorry, I encountered an error communicating with the AI. Please check the console and try again.");
        scrollToBottom();
        // Restore user input if AI fails but user message was valid
        userInput.value = currentUserInput;
    } finally {
        // Re-enable input elements reliably
        userInput.disabled = false;
        sendButton.disabled = false;
        // Only re-enable mic if not currently in a recording state (edge case)
        if (!isRecording) {
             micButton.disabled = false;
        }
        userInput.focus(); // Set focus back to input
    }
}

// Event listeners
sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (event) => {
    // Check if input is not disabled before sending
    if (event.key === 'Enter' && !userInput.disabled) {
        sendMessage();
    }
});

// --- Microphone Functionality ---

async function startRecording() {
    // Prevent starting a new recording if already recording or inputs are disabled
    if (isRecording || userInput.disabled) return;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); // Adjust mime type if needed

            console.log("Audio recorded:", audioBlob);

            // Simulate transcription placeholder
            userInput.value = "[Audio recorded - transcribe placeholder]"; // Placeholder
            displayMessage('system', 'Recording stopped. Transcribed text (placeholder) added.', true); // Info message

            // Cleanup stream tracks
            stream.getTracks().forEach(track => track.stop());

             // Restore UI state *after* processing is done
            isRecording = false;
            micButton.classList.remove('recording');
            micButton.textContent = '🎤'; // Mic icon
            micButton.setAttribute('aria-label', 'Record audio message');
            userInput.placeholder = 'Type your message or use the microphone...'; // Restore placeholder
            userInput.disabled = false; // Re-enable text input
            sendButton.disabled = false; // Re-enable send button
             micButton.disabled = false; // Ensure mic button is enabled too
            userInput.focus();
            userInput.select(); // Select the placeholder text for easy editing or sending


        };

        // UI changes for recording state
        isRecording = true;
        micButton.classList.add('recording');
        micButton.textContent = '🛑'; // Stop icon
        micButton.setAttribute('aria-label', 'Stop recording');
        userInput.placeholder = 'Recording audio...'; // Update placeholder
        userInput.disabled = true; // Disable text input while recording
        sendButton.disabled = true; // Disable send while recording

        mediaRecorder.start();


    } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Could not access microphone. Please ensure permission is granted.");
         // Reset UI state if mic access fails
        isRecording = false;
        micButton.classList.remove('recording');
        micButton.textContent = '🎤';
        micButton.setAttribute('aria-label', 'Record audio message');
        userInput.placeholder = 'Type your message or use the microphone...';
        // Ensure buttons are enabled if they were disabled before the attempt
        userInput.disabled = false;
        sendButton.disabled = false;
        micButton.disabled = false;

    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop(); // This will trigger the 'onstop' event handler
    } else {
        // If somehow stop is called when not recording, reset UI just in case
         isRecording = false;
         micButton.classList.remove('recording');
         micButton.textContent = '🎤'; // Mic icon
         micButton.setAttribute('aria-label', 'Record audio message');
         userInput.placeholder = 'Type your message or use the microphone...'; // Restore placeholder
         userInput.disabled = false; // Re-enable text input
         sendButton.disabled = false; // Re-enable send button
         micButton.disabled = false;
    }
}

micButton.addEventListener('click', () => {
    if (isRecording) {
        stopRecording();
    } else {
        // Only start recording if inputs aren't already disabled (e.g., during AI response)
        if (!userInput.disabled) {
             startRecording();
        }
    }
});