/* ════════════════════════════════════════════════════════════
   AI Investor Readiness Agent — App Logic
   ════════════════════════════════════════════════════════════ */

// ── State ───────────────────────────────────────────────────
let currentPage = 'home';
let allCalls = [];
let filteredCalls = [];
let allUsers = [];
let allResumes = [];
let resumesByEmail = {};  // email -> resume data (cached)

// ── Pagination State ────────────────────────────────────────
let currentPageNum = 1;
const CARDS_PER_PAGE = 10;

// ── Call Recording State ────────────────────────────────────
let activeRecordings = {};  // callId -> { mediaRecorder, chunks, stream, startTime }

// ── Navigation ──────────────────────────────────────────────

function navigateTo(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Show target page
    const target = document.getElementById(`page-${page}`);
    if (target) {
        target.classList.add('active');
    }

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const navBtn = document.getElementById(`nav-${page}`);
    if (navBtn) navBtn.classList.add('active');

    currentPage = page;

    // Load data for the page
    if (page === 'home') {
        initFiltersToToday();
        loadCalls();
    }
    if (page === 'users') loadUsers();
    if (page === 'resumes') loadResumes();
}

// ── Toast Notification ──────────────────────────────────────

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

// ── Health Check / LLM Badge ────────────────────────────────

async function checkHealth() {
    try {
        const resp = await fetch('/api/health');
        const data = await resp.json();
        const badge = document.getElementById('llm-provider-label');
        if (badge && data.llm_provider) {
            badge.textContent = data.llm_provider.toUpperCase();
        }
    } catch (e) {
        console.warn('Health check failed:', e);
    }
}

// ══════════════════════════════════════════════════════════════
//  HOME PAGE — Calls
// ══════════════════════════════════════════════════════════════

// ── Filter & Pagination Functions ────────────────────────────

function initFiltersToToday() {
    const today = new Date().toISOString().split('T')[0];
    const fromEl = document.getElementById('filter-date-from');
    const toEl = document.getElementById('filter-date-to');
    if (fromEl && !fromEl.value) fromEl.value = today;
    if (toEl && !toEl.value) toEl.value = today;
}

function applyFilters() {
    const fromDate = document.getElementById('filter-date-from').value;
    const toDate = document.getElementById('filter-date-to').value;
    const callType = document.getElementById('filter-call-type').value;

    filteredCalls = allCalls.filter(call => {
        // Date range filter
        if (fromDate && call.date && call.date < fromDate) return false;
        if (toDate && call.date && call.date > toDate) return false;

        // Call type filter
        if (callType !== 'all' && call.call_type !== callType) return false;

        return true;
    });

    // Reset to page 1 when filters change
    currentPageNum = 1;
    renderFilteredCalls();
}

function resetFilters() {
    document.getElementById('filter-date-from').value = '';
    document.getElementById('filter-date-to').value = '';
    document.getElementById('filter-call-type').value = 'all';
    filteredCalls = [...allCalls];
    currentPageNum = 1;
    renderFilteredCalls();
}

function goToPage(page) {
    const totalPages = Math.ceil(filteredCalls.length / CARDS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    currentPageNum = page;
    renderFilteredCalls();
}

function renderFilteredCalls() {
    const grid = document.getElementById('calls-grid');
    const emptyState = document.getElementById('calls-empty-state');
    const paginationBar = document.getElementById('pagination-bar');

    grid.innerHTML = '';

    // Update stats based on filtered data
    const interviews = filteredCalls.filter(c => c.call_type === 'interview').length;
    const normal = filteredCalls.filter(c => c.call_type === 'normal').length;
    const scheduled = filteredCalls.filter(c => c.status === 'scheduled').length;
    updateStats(filteredCalls.length, interviews, normal, scheduled);

    if (filteredCalls.length === 0) {
        emptyState.style.display = 'block';
        paginationBar.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';

    // Pagination
    const totalPages = Math.ceil(filteredCalls.length / CARDS_PER_PAGE);
    const startIdx = (currentPageNum - 1) * CARDS_PER_PAGE;
    const endIdx = Math.min(startIdx + CARDS_PER_PAGE, filteredCalls.length);
    const pageCalls = filteredCalls.slice(startIdx, endIdx);

    pageCalls.forEach(call => {
        grid.appendChild(createCallCard(call));
    });

    // Update pagination controls
    if (totalPages > 1) {
        paginationBar.style.display = 'flex';
        document.getElementById('pagination-info').textContent = `Page ${currentPageNum} of ${totalPages}`;
        document.getElementById('pagination-prev').disabled = currentPageNum <= 1;
        document.getElementById('pagination-next').disabled = currentPageNum >= totalPages;
    } else {
        paginationBar.style.display = 'none';
    }
}

async function loadCalls() {
    const grid = document.getElementById('calls-grid');
    const emptyState = document.getElementById('calls-empty-state');
    const loading = document.getElementById('calls-loading');

    loading.style.display = 'block';
    emptyState.style.display = 'none';
    grid.innerHTML = '';

    try {
        const resp = await fetch('/api/calls/');
        allCalls = await resp.json();

        // Preload resume data for interview calls
        await preloadResumeData();

        loading.style.display = 'none';

        if (allCalls.length === 0) {
            emptyState.style.display = 'block';
            updateStats(0, 0, 0, 0);
            document.getElementById('pagination-bar').style.display = 'none';
            return;
        }

        emptyState.style.display = 'none';

        // Apply filters (this also renders)
        applyFilters();

    } catch (e) {
        loading.style.display = 'none';
        console.error('Error loading calls:', e);
        showToast('Failed to load calls', 'error');
    }
}

async function preloadResumeData() {
    // Collect all participant emails from interview calls
    try {
        const resp = await fetch('/api/resumes/');
        const resumes = await resp.json();
        resumesByEmail = {};
        resumes.forEach(r => {
            const key = r.user_email.toLowerCase();
            if (!resumesByEmail[key]) {
                resumesByEmail[key] = r;
            }
        });
    } catch (e) {
        console.warn('Could not preload resume data:', e);
    }
}

function updateStats(total, interviews, normal, scheduled) {
    animateCounter('stat-total-calls', total);
    animateCounter('stat-interviews', interviews);
    animateCounter('stat-normal', normal);
    animateCounter('stat-scheduled', scheduled);
}

function animateCounter(elementId, target) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const start = parseInt(el.textContent) || 0;
    const duration = 600;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(start + (target - start) * eased);
        if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
}

function createCallCard(call) {
    const card = document.createElement('div');
    card.className = 'call-card';
    card.onclick = () => openCallDetail(call);

    const isInterview = call.call_type === 'interview';
    const participants = (call.participants || []).join(', ') || 'No participants';

    let ratingHtml = '';
    if (isInterview && call.rating) {
        const stars = '★'.repeat(Math.round(call.rating));
        const empty = '☆'.repeat(5 - Math.round(call.rating));
        ratingHtml = `
            <div class="call-rating">
                <span class="star">${stars}${empty}</span>
                <span class="score">${call.rating}/5</span>
            </div>
        `;
    }

    let summaryHtml = '';
    if (call.summary) {
        summaryHtml = `<div class="call-card-summary">${call.summary}</div>`;
    }

    // Recording status indicator
    const isRecording = activeRecordings[call.id] !== undefined;
    let recordingBadge = '';
    if (isRecording) {
        recordingBadge = '<span class="recording-badge">🔴 Recording</span>';
    }

    // Transcript PDF stored indicator
    let storedBadge = '';
    if (call.transcript_pdf_stored) {
        storedBadge = '<span class="emailed-badge">📄 PDF Saved</span>';
    }

    // Resume button for interview calls
    let resumeBtnHtml = '';
    if (isInterview) {
        const resumeInfo = getResumeForCall(call);
        if (resumeInfo) {
            resumeBtnHtml = `<button class="btn btn-xs btn-secondary" onclick="event.stopPropagation(); viewResume('${resumeInfo.id}')">📄 View Resume</button>`;
        } else {
            resumeBtnHtml = `<button class="btn btn-xs btn-resume-warning" onclick="event.stopPropagation(); navigateTo('resumes');">⚠️ Add Resume</button>`;
        }
    }

    card.innerHTML = `
        <div class="call-card-stripe ${isInterview ? 'interview' : 'normal'}"></div>
        <div class="call-card-body">
            <div class="call-card-top">
                <span class="call-type-badge ${isInterview ? 'interview' : 'normal'}">
                    ${isInterview ? '🎯 Interview' : '💬 Normal Call'}
                </span>
                <span class="call-status-badge ${call.status}">
                    ${call.status === 'completed' ? '✅' : '🕐'} ${call.status}
                </span>
                ${recordingBadge}
            </div>
            <div class="call-card-datetime">
                <span>📅 ${call.date || 'TBD'}</span>
                <span>⏰ ${call.time || 'TBD'}</span>
            </div>
            <div class="call-card-participants">
                ${(call.participants || []).map(p => `<span class="participant-chip">👤 ${p}</span>`).join('')}
            </div>
            ${summaryHtml}
            ${storedBadge}
        </div>
        <div class="call-card-footer">
            ${ratingHtml || '<span></span>'}
            <div class="call-card-actions">
                ${call.meet_link ? `<a href="${call.meet_link}" target="_blank" class="btn btn-xs btn-secondary" onclick="event.stopPropagation()">🔗 Meet</a>` : ''}
                ${resumeBtnHtml}
                ${call.status === 'scheduled' && !isRecording ? `<button class="btn btn-xs btn-record" onclick="event.stopPropagation(); startCallRecording('${call.id}')">🎙️ Record</button>` : ''}
                ${isRecording ? `<button class="btn btn-xs btn-stop-record" onclick="event.stopPropagation(); stopCallRecording('${call.id}')">⏹️ Stop</button>` : ''}
            </div>
        </div>
    `;

    return card;
}

function getResumeForCall(call) {
    // Check if any participant of this interview call has a resume
    // We look up by participant name matching resume username or email
    if (!call.participants || call.participants.length === 0) return null;

    for (const participantName of call.participants) {
        // Check resumesByEmail (loaded from /api/resumes/)
        for (const email in resumesByEmail) {
            const resume = resumesByEmail[email];
            if (
                (resume.username && resume.username.toLowerCase() === participantName.toLowerCase()) ||
                (resume.user_email && resume.user_email.toLowerCase() === participantName.toLowerCase())
            ) {
                return resume;
            }
        }
        // Also check if the call has user_email and that email has a resume
        if (call.user_email) {
            const emailKey = call.user_email.toLowerCase();
            if (resumesByEmail[emailKey]) return resumesByEmail[emailKey];
        }
    }
    return null;
}

function openCallDetail(call) {
    const modal = document.getElementById('call-modal');
    const body = document.getElementById('modal-body');
    const isInterview = call.call_type === 'interview';

    let ratingSection = '';
    if (isInterview && call.rating) {
        const stars = '★'.repeat(Math.round(call.rating));
        const empty = '☆'.repeat(5 - Math.round(call.rating));
        ratingSection = `
            <div class="modal-detail-section">
                <h3>Rating & Feedback</h3>
                <div class="call-rating" style="margin-bottom: 10px; font-size: 1.2rem;">
                    <span class="star">${stars}${empty}</span>
                    <span class="score">${call.rating}/5</span>
                </div>
                ${call.feedback ? `<p>${call.feedback}</p>` : ''}
            </div>
        `;
    }

    // Recording controls for modal
    const isRecording = activeRecordings[call.id] !== undefined;
    let recordingControlsHtml = '';
    if (call.status === 'scheduled') {
        if (isRecording) {
            const startTime = activeRecordings[call.id]?.startTime || Date.now();
            recordingControlsHtml = `
                <div class="modal-detail-section recording-section">
                    <h3>🎙️ Live Recording</h3>
                    <div class="recording-active-indicator">
                        <div class="recording-pulse"></div>
                        <span>Recording in progress...</span>
                        <span id="recording-timer-${call.id}" class="recording-timer">00:00</span>
                    </div>
                    <button class="btn btn-danger btn-sm" onclick="stopCallRecording('${call.id}')" style="margin-top: 12px;">
                        ⏹️ Stop Recording & Process Transcript
                    </button>
                </div>
            `;
        } else {
            recordingControlsHtml = `
                <div class="modal-detail-section">
                    <h3>🎙️ Call Recording</h3>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 8px;">
                        <strong>📢 How it works:</strong> Click "Start Recording" and then select the browser tab 
                        where your call is happening. <strong>Check "Share audio"</strong> to capture 
                        <em>both</em> your voice and the other person's voice.
                    </p>
                    <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 12px;">
                        The transcript will automatically label speakers as <strong style="color: #1a73e8;">HR</strong> 
                        and <strong style="color: #0d7c3d;">Employee</strong>.
                    </p>
                    <button class="btn btn-primary btn-sm" onclick="startCallRecording('${call.id}')">
                        🎙️ Start Recording
                    </button>
                </div>
            `;
        }
    }

    // Transcript actions
    let buttonsHtml = '<div class="modal-buttons">';
    if (call.resume_id) {
        buttonsHtml += `<button class="btn btn-secondary btn-sm" onclick="viewResume('${call.resume_id}')">📄 View Resume</button>`;
    }
    if (call.transcript) {
        buttonsHtml += `<button class="btn btn-secondary btn-sm" onclick="showTranscript('${call.id}')">📝 View Transcript</button>`;
        buttonsHtml += `<button class="btn btn-primary btn-sm" onclick="downloadTranscriptPdf('${call.id}')">📄 Download PDF</button>`;
    }
    buttonsHtml += '</div>';

    body.innerHTML = `
        <div class="modal-detail-header">
            <h2>${isInterview ? '🎯 Interview Call' : '💬 Normal Call'}</h2>
            <div class="modal-detail-meta">
                <span>📅 ${call.date || 'N/A'}</span>
                <span>⏰ ${call.time || 'N/A'}</span>
                <span class="call-status-badge ${call.status}">${call.status}</span>
            </div>
        </div>

        <div class="modal-detail-section">
            <h3>Participants</h3>
            <div class="call-card-participants" style="margin-top: 8px;">
                ${(call.participants || []).map(p => `<span class="participant-chip">👤 ${p}</span>`).join('')}
            </div>
        </div>

        ${call.summary ? `
            <div class="modal-detail-section">
                <h3>Summary</h3>
                <p>${call.summary}</p>
            </div>
        ` : ''}

        ${ratingSection}

        ${call.meet_link ? `
            <div class="modal-detail-section">
                <h3>Meeting Link</h3>
                <a href="${call.meet_link}" target="_blank" style="color: var(--primary-400);">${call.meet_link}</a>
            </div>
        ` : ''}

        ${recordingControlsHtml}

        ${buttonsHtml}
    `;

    // Start timer update if recording
    if (isRecording) {
        updateRecordingTimer(call.id);
    }

    modal.classList.add('open');
}

function closeModal(event) {
    if (event.target === event.currentTarget) {
        document.getElementById('call-modal').classList.remove('open');
    }
}

function closeModalForce() {
    document.getElementById('call-modal').classList.remove('open');
}

async function viewResume(resumeId) {
    window.open(`/api/resumes/download/${resumeId}`, '_blank');
}

function showTranscript(callId) {
    const call = allCalls.find(c => c.id === callId);
    if (!call || !call.transcript) {
        showToast('No transcript available', 'error');
        return;
    }

    // Format transcript with speaker label colors
    const lines = call.transcript.split('\n');
    let formattedHtml = '';
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.includes(': ') && trimmed.split(': ', 1)[0].replace(/ /g, '').match(/^[a-zA-Z]+$/)) {
            const colonIdx = trimmed.indexOf(': ');
            const speaker = trimmed.substring(0, colonIdx).trim();
            const text = trimmed.substring(colonIdx + 2);

            if (speaker.toUpperCase() === 'HR') {
                formattedHtml += `<div style="margin-bottom: 12px;">
                    <span style="color: #1a73e8; font-weight: 700; font-size: 0.9rem;">🎤 ${speaker}:</span>
                    <div style="margin-left: 20px; margin-top: 2px; color: var(--text-primary);">${text}</div>
                </div>`;
            } else {
                formattedHtml += `<div style="margin-bottom: 12px;">
                    <span style="color: #0d7c3d; font-weight: 700; font-size: 0.9rem;">👤 ${speaker}:</span>
                    <div style="margin-left: 20px; margin-top: 2px; color: var(--text-primary);">${text}</div>
                </div>`;
            }
        } else {
            formattedHtml += `<div style="margin-bottom: 8px; color: var(--text-primary);">${trimmed}</div>`;
        }
    }

    const body = document.getElementById('modal-body');
    body.innerHTML = `
        <div class="modal-detail-header">
            <h2>📝 Call Transcript</h2>
            <button class="btn btn-secondary btn-sm" style="margin-top: 8px;" onclick="openCallDetail(allCalls.find(c => c.id === '${callId}'))">← Back to Details</button>
        </div>
        <div class="modal-detail-section" style="max-height: 60vh; overflow-y: auto;">
            ${formattedHtml || '<pre>' + call.transcript + '</pre>'}
        </div>
        <div class="modal-buttons">
            <button class="btn btn-primary btn-sm" onclick="downloadTranscriptPdf('${callId}')">📄 Download PDF</button>
        </div>
    `;
}

// ══════════════════════════════════════════════════════════════
//  CALL RECORDING — Browser Audio Capture
// ══════════════════════════════════════════════════════════════

async function startCallRecording(callId) {
    if (activeRecordings[callId]) {
        showToast('Already recording this call!', 'error');
        return;
    }

    try {
        // ── Step 1: Capture microphone (YOUR voice / HR) ──
        const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,  // Disabled so we don't cancel the other person's voice from speaker
                noiseSuppression: true,
                sampleRate: 44100,
            }
        });

        // ── Step 2: Try to capture system/speaker audio (OTHER person's voice) ──
        let systemStream = null;
        let combinedStream = null;
        let extraTracks = []; // tracks to stop later

        try {
            // getDisplayMedia with audio captures system sound (what comes out of speakers)
            // User needs to share a tab/screen and check "Share audio"
            showToast('📢 Please select the browser tab with your call and CHECK "Share audio" to capture both voices!', 'info');

            systemStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,  // Video is required by the API but we won't use it
                audio: true,  // This captures system/tab audio
            });

            // Stop the video track immediately — we only need audio
            systemStream.getVideoTracks().forEach(track => {
                track.stop();
            });

            const systemAudioTracks = systemStream.getAudioTracks();

            if (systemAudioTracks.length > 0) {
                // ── Mix mic + system audio into a stereo stream ──
                // Left channel = Mic (HR), Right channel = System (Employee)
                const audioContext = new AudioContext({ sampleRate: 44100 });
                const micSource = audioContext.createMediaStreamSource(micStream);
                const systemSource = audioContext.createMediaStreamSource(
                    new MediaStream(systemAudioTracks)
                );

                // Create a stereo merger: 2 inputs → 1 stereo output
                const merger = audioContext.createChannelMerger(2);
                micSource.connect(merger, 0, 0);      // mic → left channel
                systemSource.connect(merger, 0, 1);    // system → right channel

                const destination = audioContext.createMediaStreamDestination();
                merger.connect(destination);

                combinedStream = destination.stream;
                extraTracks = [...micStream.getTracks(), ...systemAudioTracks];

                console.log('[Recording] Stereo recording: mic (L) + system audio (R)');
            } else {
                console.log('[Recording] No system audio tracks available, using mic only');
            }
        } catch (displayErr) {
            console.log('[Recording] System audio capture not available:', displayErr.message);
            // This is fine — we'll just record mic only (mono)
        }

        // Use combined stereo stream if available, otherwise just mic
        const recordStream = combinedStream || micStream;

        // ── Step 3: Start MediaRecorder ──
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/mp4';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = ''; // browser default
                }
            }
        }

        const options = mimeType ? { mimeType } : {};
        const mediaRecorder = new MediaRecorder(recordStream, options);
        const chunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                chunks.push(e.data);
            }
        };

        mediaRecorder.start(1000); // collect data every second

        activeRecordings[callId] = {
            mediaRecorder,
            chunks,
            stream: recordStream,
            extraTracks,  // additional tracks to stop on end
            micStream,
            systemStream,
            startTime: Date.now(),
            mimeType: mediaRecorder.mimeType || 'audio/webm',
            isStereo: !!combinedStream,
        };

        const modeMsg = combinedStream
            ? '🎙️ Recording BOTH voices (stereo)! Your mic + system audio captured.'
            : '🎙️ Recording your microphone only. For better results, share tab audio next time.';
        showToast(modeMsg, 'success');
        loadCalls(); // Refresh to show recording badge

        // If modal is open, refresh it
        const call = allCalls.find(c => c.id === callId);
        if (call && document.getElementById('call-modal').classList.contains('open')) {
            openCallDetail(call);
        }

    } catch (err) {
        console.error('Failed to start recording:', err);
        if (err.name === 'NotAllowedError') {
            showToast('⚠️ Microphone access denied. Please allow microphone access and try again.', 'error');
        } else {
            showToast('⚠️ Could not start recording: ' + err.message, 'error');
        }
    }
}

async function stopCallRecording(callId) {
    const recording = activeRecordings[callId];
    if (!recording) {
        showToast('No active recording for this call', 'error');
        return;
    }

    showToast('⏳ Stopping recording and processing transcript...', 'info');

    return new Promise((resolve) => {
        recording.mediaRecorder.onstop = async () => {
            // Stop all tracks (mic, system audio, combined)
            recording.stream.getTracks().forEach(track => track.stop());
            if (recording.extraTracks) {
                recording.extraTracks.forEach(track => track.stop());
            }
            if (recording.micStream) {
                recording.micStream.getTracks().forEach(track => track.stop());
            }
            if (recording.systemStream) {
                recording.systemStream.getTracks().forEach(track => track.stop());
            }

            // Create audio blob
            const ext = recording.mimeType.includes('mp4') ? 'mp4' : 'webm';
            const blob = new Blob(recording.chunks, { type: recording.mimeType });

            // Remove from active recordings
            delete activeRecordings[callId];

            if (blob.size < 1000) {
                showToast('⚠️ Recording too short or empty. Please try again.', 'error');
                loadCalls();
                resolve();
                return;
            }

            // Send to backend
            await processCallRecording(callId, blob, `call_recording.${ext}`);
            resolve();
        };

        recording.mediaRecorder.stop();
    });
}

async function processCallRecording(callId, audioBlob, filename) {
    // Show processing modal
    const modal = document.getElementById('call-modal');
    const body = document.getElementById('modal-body');
    modal.classList.add('open');

    body.innerHTML = `
        <div class="processing-overlay">
            <div class="processing-spinner"></div>
            <h2>🎙️ Processing Call Recording...</h2>
            <div class="processing-steps">
                <div class="processing-step active" id="step-transcribe">
                    <span class="step-icon">🔄</span>
                    <span>Transcribing audio with Whisper AI...</span>
                </div>
                <div class="processing-step" id="step-summary">
                    <span class="step-icon">⏳</span>
                    <span>Generating AI summary...</span>
                </div>
                <div class="processing-step" id="step-pdf">
                    <span class="step-icon">⏳</span>
                    <span>Creating PDF & storing in MongoDB...</span>
                </div>
                <div class="processing-step" id="step-vector">
                    <span class="step-icon">⏳</span>
                    <span>Storing transcript in Vector DB...</span>
                </div>
            </div>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 16px;">
                This may take a minute depending on the recording length.
            </p>
        </div>
    `;

    // Animate steps (visual feedback while waiting)
    setTimeout(() => {
        const step = document.getElementById('step-summary');
        if (step) { step.classList.add('active'); step.querySelector('.step-icon').textContent = '🔄'; }
    }, 3000);
    setTimeout(() => {
        const step = document.getElementById('step-pdf');
        if (step) { step.classList.add('active'); step.querySelector('.step-icon').textContent = '🔄'; }
    }, 6000);
    setTimeout(() => {
        const step = document.getElementById('step-vector');
        if (step) { step.classList.add('active'); step.querySelector('.step-icon').textContent = '🔄'; }
    }, 9000);

    try {
        const formData = new FormData();
        formData.append('audio', audioBlob, filename);

        const resp = await fetch(`/api/calls/${callId}/end-call`, {
            method: 'POST',
            body: formData,
        });

        const data = await resp.json();

        if (!resp.ok) {
            throw new Error(data.detail || 'Failed to process recording');
        }

        // Show success
        body.innerHTML = `
            <div class="processing-overlay success">
                <div class="success-checkmark">✅</div>
                <h2>Call Processed Successfully!</h2>
                <div class="success-details">
                    <div class="success-item">
                        <span>📝 <strong>Transcript:</strong></span>
                        <span>${data.transcript ? data.transcript.substring(0, 150) + '...' : 'Generated'}</span>
                    </div>
                    <div class="success-item">
                        <span>📊 <strong>Summary:</strong></span>
                        <span>${data.summary || 'Generated'}</span>
                    </div>
                    <div class="success-item">
                        <span>📄 <strong>PDF Stored:</strong></span>
                        <span>${data.pdf_stored ? '✅ Saved to MongoDB' : '❌ Failed'}</span>
                    </div>
                    <div class="success-item">
                        <span>🧠 <strong>Vector DB:</strong></span>
                        <span>${data.vector_stored ? '✅ Stored in Qdrant' : '❌ Failed'}</span>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="closeModalForce(); loadCalls();" style="margin-top: 20px;">
                    ✅ Done
                </button>
            </div>
        `;

        showToast('🎉 Transcript saved! PDF stored in MongoDB, text stored in Vector DB.', 'success');

    } catch (err) {
        console.error('Error processing call recording:', err);
        body.innerHTML = `
            <div class="processing-overlay error">
                <div class="error-icon">❌</div>
                <h2>Processing Failed</h2>
                <p style="color: var(--text-secondary);">${err.message}</p>
                <button class="btn btn-secondary" onclick="closeModalForce(); loadCalls();" style="margin-top: 20px;">
                    Close
                </button>
            </div>
        `;
        showToast('❌ Failed to process recording: ' + err.message, 'error');
    }
}

function downloadTranscriptPdf(callId) {
    window.open(`/api/calls/${callId}/download-transcript`, '_blank');
}

function updateRecordingTimer(callId) {
    const recording = activeRecordings[callId];
    if (!recording) return;

    const timerEl = document.getElementById(`recording-timer-${callId}`);
    if (!timerEl) return;

    const elapsed = Math.floor((Date.now() - recording.startTime) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    timerEl.textContent = `${mins}:${secs}`;

    if (activeRecordings[callId]) {
        setTimeout(() => updateRecordingTimer(callId), 1000);
    }
}

// ══════════════════════════════════════════════════════════════
//  ADD USERS PAGE
// ══════════════════════════════════════════════════════════════

async function loadUsers() {
    try {
        const resp = await fetch('/api/users/');
        allUsers = await resp.json();
        renderUsersTable();
    } catch (e) {
        console.error('Error loading users:', e);
        showToast('Failed to load users', 'error');
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('users-tbody');
    const emptyEl = document.getElementById('users-empty');
    const badge = document.getElementById('user-count-badge');

    tbody.innerHTML = '';
    badge.textContent = allUsers.length;

    if (allUsers.length === 0) {
        emptyEl.style.display = 'block';
        return;
    }

    emptyEl.style.display = 'none';

    allUsers.forEach((user, index) => {
        const tr = document.createElement('tr');
        const date = user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        }) : 'N/A';

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${user.username}</strong></td>
            <td style="color: var(--primary-300);">${user.email}</td>
            <td style="color: var(--text-secondary);">${date}</td>
            <td>
                <button class="btn btn-xs btn-danger" onclick="deleteUser('${user.email}')">🗑️ Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function addUser() {
    const username = document.getElementById('input-username').value.trim();
    const email = document.getElementById('input-email').value.trim();

    if (!username || !email) {
        showToast('Please fill in both username and email', 'error');
        return;
    }

    // Basic email validation
    if (!email.includes('@') || !email.includes('.')) {
        showToast('Please enter a valid email address', 'error');
        return;
    }

    const btn = document.getElementById('btn-add-user');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Adding...';

    try {
        const resp = await fetch('/api/users/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email }),
        });

        const data = await resp.json();

        if (!resp.ok) {
            showToast(data.detail || 'Failed to add user', 'error');
            return;
        }

        showToast(`User "${username}" added successfully!`, 'success');
        document.getElementById('input-username').value = '';
        document.getElementById('input-email').value = '';
        loadUsers();

    } catch (e) {
        console.error('Error adding user:', e);
        showToast('Failed to add user', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>➕</span> Add User';
    }
}

async function deleteUser(email) {
    if (!confirm(`Delete user with email "${email}"?`)) return;

    try {
        const resp = await fetch(`/api/users/${email}`, { method: 'DELETE' });
        if (resp.ok) {
            showToast('User deleted', 'success');
            loadUsers();
        } else {
            showToast('Failed to delete user', 'error');
        }
    } catch (e) {
        showToast('Failed to delete user', 'error');
    }
}

// ══════════════════════════════════════════════════════════════
//  ADD RESUME PAGE
// ══════════════════════════════════════════════════════════════

async function loadResumes() {
    try {
        const resp = await fetch('/api/resumes/');
        allResumes = await resp.json();
        renderResumesTable();
    } catch (e) {
        console.error('Error loading resumes:', e);
        showToast('Failed to load resumes', 'error');
    }
}

function renderResumesTable() {
    const tbody = document.getElementById('resumes-tbody');
    const emptyEl = document.getElementById('resumes-empty');
    const badge = document.getElementById('resume-count-badge');

    tbody.innerHTML = '';
    badge.textContent = allResumes.length;

    if (allResumes.length === 0) {
        emptyEl.style.display = 'block';
        return;
    }

    emptyEl.style.display = 'none';

    allResumes.forEach((resume, index) => {
        const tr = document.createElement('tr');
        const date = resume.uploaded_at ? new Date(resume.uploaded_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        }) : 'N/A';

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${resume.username || 'N/A'}</strong></td>
            <td style="color: var(--primary-300);">${resume.user_email}</td>
            <td>${resume.filename}</td>
            <td style="color: var(--text-secondary);">${date}</td>
            <td>
                <div style="display: flex; gap: 4px;">
                    <a href="/api/resumes/download/${resume.id}" target="_blank" class="btn btn-xs btn-secondary">📄 View</a>
                    <button class="btn btn-xs btn-danger" onclick="deleteResume('${resume.id}')">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateFileName() {
    const input = document.getElementById('input-resume-file');
    const label = document.getElementById('file-name-label');
    if (input.files.length > 0) {
        label.textContent = input.files[0].name;
        label.style.color = 'var(--text-primary)';
    } else {
        label.textContent = 'Choose a PDF file...';
        label.style.color = 'var(--text-muted)';
    }
}

async function uploadResume() {
    const email = document.getElementById('input-resume-email').value.trim();
    const fileInput = document.getElementById('input-resume-file');

    if (!email) {
        showToast('Please enter the user email', 'error');
        return;
    }

    if (!fileInput.files.length) {
        showToast('Please select a PDF file', 'error');
        return;
    }

    const file = fileInput.files[0];
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        showToast('Only PDF files are accepted', 'error');
        return;
    }

    const btn = document.getElementById('btn-upload-resume');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Uploading...';

    const formData = new FormData();
    formData.append('email', email);
    formData.append('file', file);

    try {
        const resp = await fetch('/api/resumes/upload', {
            method: 'POST',
            body: formData,
        });

        const data = await resp.json();

        if (!resp.ok) {
            showToast(data.detail || 'Failed to upload resume', 'error');
            return;
        }

        showToast(`Resume "${file.name}" uploaded successfully!`, 'success');
        document.getElementById('input-resume-email').value = '';
        fileInput.value = '';
        document.getElementById('file-name-label').textContent = 'Choose a PDF file...';
        document.getElementById('file-name-label').style.color = 'var(--text-muted)';
        loadResumes();

    } catch (e) {
        console.error('Error uploading resume:', e);
        showToast('Failed to upload resume', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>⬆️</span> Upload';
    }
}

async function deleteResume(resumeId) {
    if (!confirm('Delete this resume?')) return;

    try {
        const resp = await fetch(`/api/resumes/${resumeId}`, { method: 'DELETE' });
        if (resp.ok) {
            showToast('Resume deleted', 'success');
            loadResumes();
        } else {
            showToast('Failed to delete resume', 'error');
        }
    } catch (e) {
        showToast('Failed to delete resume', 'error');
    }
}

// ── Initialize ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    checkHealth();
    initFiltersToToday();
    loadCalls();

    // Keyboard shortcut: Enter to submit on forms
    document.getElementById('input-email')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addUser();
    });

    document.getElementById('input-resume-email')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') uploadResume();
    });
});
