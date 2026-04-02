/* ════════════════════════════════════════════════════════════
   Nova AI Agent — Avatar + Chat Panel Logic
   Session-based chat history stored in memory.
   ════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    // ── State ──────────────────────────────────────────────
    let sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    let conversationHistory = [];
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let isPanelOpen = false;
    let isSpeaking = false;
    let hasGreeted = false;

    // ── DOM References ─────────────────────────────────────
    const avatarBtn = document.getElementById('mark-avatar-btn');
    const chatPanel = document.getElementById('mark-chat-panel');
    const chatMessages = document.getElementById('mark-chat-messages');
    const chatClose = document.getElementById('mark-chat-close');
    const textInput = document.getElementById('mark-text-input');
    const sendBtn = document.getElementById('mark-send-btn');
    const micBtn = document.getElementById('mark-mic-btn');
    const muteBtn = document.getElementById('mark-mute-btn');
    const statusLabel = document.getElementById('mark-status-label');

    // SVG for Mark's mini avatar in messages
    const markMiniSVG = `<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="28" cy="28" r="28" fill="url(#gMini)"/>
        <rect x="18" y="12" width="20" height="22" rx="10" fill="#e0e7ff"/>
        <circle cx="23" cy="22" r="2" fill="#312e81"/>
        <circle cx="33" cy="22" r="2" fill="#312e81"/>
        <circle cx="24" cy="21" r="0.6" fill="white"/>
        <circle cx="34" cy="21" r="0.6" fill="white"/>
        <path d="M25 28 Q28 31 31 28" stroke="#4338ca" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <rect x="16" y="12" width="24" height="8" rx="4" fill="#6366f1" opacity="0.3"/>
        <defs><linearGradient id="gMini" x1="0" y1="0" x2="56" y2="56"><stop stop-color="#4338ca"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs>
    </svg>`;

    // ── Initialize ─────────────────────────────────────────
    if (avatarBtn) {
        avatarBtn.classList.add('idle');
        updateStatus('');
    }

    // Load voices for SpeechSynthesis
    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => { };
    }

    // ── Avatar Click → Toggle Panel ────────────────────────
    if (avatarBtn) {
        avatarBtn.addEventListener('click', () => {
            if (!hasGreeted) {
                hasGreeted = true;
                togglePanel(true);
                const greeting = "Hey! I'm Nova, your AI meeting assistant. I can schedule calls, look up meeting summaries, and more. How can I help you today?";
                addMessage('assistant', greeting);
                speak(greeting);
                return;
            }
            togglePanel(!isPanelOpen);
        });
    }

    // ── Close Panel ────────────────────────────────────────
    if (chatClose) {
        chatClose.addEventListener('click', () => {
            togglePanel(false);
        });
    }

    // ── Text Send ──────────────────────────────────────────
    if (sendBtn) {
        sendBtn.addEventListener('click', () => sendTextMessage());
    }

    if (textInput) {
        textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendTextMessage();
            }
        });
    }

    // ── Mic Button ─────────────────────────────────────────
    if (micBtn) {
        micBtn.addEventListener('click', () => {
            if (!isRecording) {
                startRecording();
            } else {
                stopRecording();
            }
        });
    }

    // ── Mute Button (Stop Nova Speaking) ──────────────────
    if (muteBtn) {
        muteBtn.addEventListener('click', () => {
            if (typeof speechSynthesis !== 'undefined') {
                speechSynthesis.cancel();
            }
            isSpeaking = false;
            setAvatarState('idle');
            updateStatus('');
            muteBtn.style.display = 'none';
        });
    }

    // ── Functions ──────────────────────────────────────────

    function togglePanel(open) {
        isPanelOpen = open;
        if (open) {
            chatPanel.classList.add('open');
            textInput.focus();
            scrollToBottom();
        } else {
            chatPanel.classList.remove('open');
        }
    }

    function updateStatus(text) {
        if (statusLabel) {
            statusLabel.textContent = text;
        }
    }

    function setAvatarState(state) {
        if (!avatarBtn) return;
        avatarBtn.classList.remove('idle', 'speaking', 'listening', 'thinking');
        if (state) {
            avatarBtn.classList.add(state);
        }

        // Update mouth animation via SVG
        const mouth = document.getElementById('mark-mouth-path');
        if (mouth) {
            if (state === 'speaking') {
                mouth.setAttribute('d', 'M25 26 Q28 32 31 26');
            } else {
                mouth.setAttribute('d', 'M25 28 Q28 31 31 28');
            }
        }
    }

    function addMessage(role, text) {
        conversationHistory.push({ role, content: text });

        // Remove welcome message if it exists
        const welcome = chatMessages.querySelector('.mark-welcome');
        if (welcome) welcome.remove();

        const msgEl = document.createElement('div');
        msgEl.className = `mark-msg ${role}`;

        const avatarEl = document.createElement('div');
        avatarEl.className = 'mark-msg-avatar';

        if (role === 'assistant') {
            avatarEl.innerHTML = markMiniSVG;
        } else {
            avatarEl.textContent = 'You';
        }

        const bubbleEl = document.createElement('div');
        bubbleEl.className = 'mark-msg-bubble';
        bubbleEl.textContent = text;

        msgEl.appendChild(avatarEl);
        msgEl.appendChild(bubbleEl);
        chatMessages.appendChild(msgEl);

        scrollToBottom();
    }

    function addTypingIndicator() {
        const typing = document.createElement('div');
        typing.className = 'mark-msg assistant';
        typing.id = 'mark-typing-indicator';

        const avatarEl = document.createElement('div');
        avatarEl.className = 'mark-msg-avatar';
        avatarEl.innerHTML = markMiniSVG;

        const bubble = document.createElement('div');
        bubble.className = 'mark-msg-bubble mark-typing';
        bubble.innerHTML = '<span></span><span></span><span></span>';

        typing.appendChild(avatarEl);
        typing.appendChild(bubble);
        chatMessages.appendChild(typing);

        scrollToBottom();
    }

    function removeTypingIndicator() {
        const typing = document.getElementById('mark-typing-indicator');
        if (typing) typing.remove();
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }

    // ── Text Message ───────────────────────────────────────
    async function sendTextMessage() {
        const text = textInput.value.trim();
        if (!text) return;

        textInput.value = '';
        addMessage('user', text);

        setAvatarState('thinking');
        updateStatus('Thinking...');
        addTypingIndicator();

        try {
            const response = await fetch('/api/agent/chat-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    message: text,
                }),
            });

            if (!response.ok) throw new Error('Server error');

            const data = await response.json();
            sessionId = data.session_id || sessionId;

            removeTypingIndicator();
            addMessage('assistant', data.assistant_response);
            speak(data.assistant_response);

            // If a call was scheduled, refresh the home page
            if (data.assistant_response.includes('scheduled') || data.assistant_response.includes('✅')) {
                if (typeof loadCalls === 'function') {
                    setTimeout(() => loadCalls(), 1000);
                }
            }

        } catch (err) {
            console.error('Chat error:', err);
            removeTypingIndicator();
            addMessage('assistant', 'Sorry, I had trouble connecting. Please try again.');
            setAvatarState('idle');
            updateStatus('');
        }
    }

    // ── Voice Recording ────────────────────────────────────
    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunks.push(event.data);
            };

            mediaRecorder.onstop = sendAudioToServer;

            mediaRecorder.start();
            isRecording = true;
            micBtn.classList.add('recording');
            setAvatarState('listening');
            updateStatus('Listening...');
        } catch (err) {
            console.error('Mic error:', err);
            addMessage('assistant', 'I need microphone access to listen. Please allow it in your browser settings.');
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }

        isRecording = false;
        micBtn.classList.remove('recording');
        setAvatarState('thinking');
        updateStatus('Processing...');
    }

    async function sendAudioToServer() {
        const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'record.webm');
        formData.append('session_id', sessionId);

        addTypingIndicator();

        try {
            const response = await fetch('/api/agent/chat', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Server error');

            const data = await response.json();
            sessionId = data.session_id || sessionId;

            removeTypingIndicator();

            if (data.user_text) {
                addMessage('user', data.user_text);
            }
            addMessage('assistant', data.assistant_response);
            speak(data.assistant_response);

            // Refresh calls if scheduling happened
            if (data.assistant_response.includes('scheduled') || data.assistant_response.includes('✅')) {
                if (typeof loadCalls === 'function') {
                    setTimeout(() => loadCalls(), 1000);
                }
            }

        } catch (err) {
            console.error('Audio chat error:', err);
            removeTypingIndicator();
            addMessage('assistant', 'Sorry, I had trouble processing that. Please try again.');
            setAvatarState('idle');
            updateStatus('');
        }
    }

    // ── Speech Synthesis (Male voice for Nova) ─────────
    function speak(text) {
        if (typeof speechSynthesis === 'undefined') return;

        // Cancel any ongoing speech
        speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);

        // Try to find a male voice
        const voices = speechSynthesis.getVoices();
        const preferredVoice = voices.find(v =>
            v.name.toLowerCase().includes('daniel') ||
            v.name.toLowerCase().includes('alex') ||
            v.name.toLowerCase().includes('david') ||
            v.name.toLowerCase().includes('james') ||
            v.name.toLowerCase().includes('thomas') ||
            (v.name.toLowerCase().includes('male') && v.lang.startsWith('en'))
        ) || voices.find(v => v.lang.startsWith('en'));

        if (preferredVoice) utterance.voice = preferredVoice;
        utterance.rate = 1.0;
        utterance.pitch = 0.95; // Slightly deeper for male voice

        utterance.onstart = () => {
            isSpeaking = true;
            setAvatarState('speaking');
            updateStatus('Speaking...');
            // Show mute button while speaking
            if (muteBtn) muteBtn.style.display = 'flex';
        };

        utterance.onend = () => {
            isSpeaking = false;
            setAvatarState('idle');
            updateStatus('');
            if (muteBtn) muteBtn.style.display = 'none';
        };

        utterance.onerror = () => {
            isSpeaking = false;
            setAvatarState('idle');
            updateStatus('');
            if (muteBtn) muteBtn.style.display = 'none';
        };

        speechSynthesis.speak(utterance);
    }
});
