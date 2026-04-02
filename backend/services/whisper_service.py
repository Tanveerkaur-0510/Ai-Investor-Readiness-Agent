"""
Whisper Service — Voice transcription with Speaker Diarization.
Transcribes audio and identifies different speakers (HR vs Employee).
"""
import os
import tempfile
import json

# Lazy-load whisper model
_whisper_model = None


def _get_whisper_model():
    """Lazy-load whisper model to avoid startup delay."""
    global _whisper_model
    if _whisper_model is None:
        try:
            import whisper
            _whisper_model = whisper.load_model("base")
            print("[Whisper] Model loaded successfully.")
        except Exception as e:
            print(f"[Whisper] Could not load model: {e}")
    return _whisper_model


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """
    Transcribe audio bytes to text using Whisper.
    Returns plain text (no speaker labels).
    """
    model = _get_whisper_model()
    if model is None:
        return ""

    suffix = os.path.splitext(filename)[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        result = model.transcribe(tmp_path, language="en")
        return result.get("text", "").strip()
    except Exception as e:
        print(f"[Whisper] Transcription error: {e}")
        return ""
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def transcribe_audio_with_segments(audio_bytes: bytes, filename: str = "audio.webm") -> dict:
    """
    Transcribe audio bytes with timestamp segments using Whisper.
    Returns dict with 'text' and 'segments' (each with start, end, text).
    """
    model = _get_whisper_model()
    if model is None:
        return {"text": "", "segments": []}

    suffix = os.path.splitext(filename)[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        result = model.transcribe(tmp_path, language="en")
        segments = []
        for seg in result.get("segments", []):
            segments.append({
                "start": seg["start"],
                "end": seg["end"],
                "text": seg["text"].strip(),
            })
        return {
            "text": result.get("text", "").strip(),
            "segments": segments,
        }
    except Exception as e:
        print(f"[Whisper] Transcription with segments error: {e}")
        return {"text": "", "segments": []}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def diarize_and_transcribe(
    audio_bytes: bytes,
    filename: str = "audio.webm",
    speaker_labels: dict = None,
) -> str:
    """
    Transcribe audio with speaker diarization.
    
    Uses energy-based channel diarization for stereo audio (mic vs system audio),
    or time-gap-based heuristic splitting for mono audio.
    
    Args:
        audio_bytes: Raw audio file bytes
        filename: Original filename
        speaker_labels: Dict mapping speaker IDs to labels,
                       e.g. {"SPEAKER_0": "HR", "SPEAKER_1": "Employee Name"}
    
    Returns:
        Formatted transcript string with speaker labels like:
        HR: Hello, how are you?
        Employee: I'm fine, thank you.
    """
    import subprocess

    if speaker_labels is None:
        speaker_labels = {"SPEAKER_0": "HR", "SPEAKER_1": "Employee"}

    suffix = os.path.splitext(filename)[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    # Convert to WAV for processing
    wav_path = tmp_path.replace(suffix, ".wav")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_path, "-ar", "16000", "-ac", "1", wav_path],
            capture_output=True,
            timeout=60,
        )
    except Exception as e:
        print(f"[Diarize] ffmpeg conversion failed: {e}")
        # Fallback: just use basic transcription
        result = transcribe_audio(audio_bytes, filename)
        _cleanup_files(tmp_path, wav_path)
        return result

    # Check if we got stereo audio (2 channels = mic + system audio)
    stereo_wav_path = tmp_path.replace(suffix, "_stereo.wav")
    is_stereo = False
    try:
        # Convert keeping stereo channels
        subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_path, "-ar", "16000", stereo_wav_path],
            capture_output=True,
            timeout=60,
        )
        import wave
        with wave.open(stereo_wav_path, "r") as wf:
            if wf.getnchannels() == 2:
                is_stereo = True
                print("[Diarize] Stereo audio detected — using channel-based diarization.")
    except Exception:
        pass

    try:
        if is_stereo:
            transcript = _diarize_stereo(
                stereo_wav_path, speaker_labels
            )
        else:
            transcript = _diarize_mono_heuristic(
                wav_path, speaker_labels
            )
        return transcript
    except Exception as e:
        print(f"[Diarize] Diarization failed, falling back to plain transcription: {e}")
        result = transcribe_audio(audio_bytes, filename)
        return result
    finally:
        _cleanup_files(tmp_path, wav_path, stereo_wav_path)


def _diarize_stereo(stereo_wav_path: str, speaker_labels: dict) -> str:
    """
    Diarize stereo audio where:
    - Left channel (channel 0) = Microphone (HR's voice)
    - Right channel (channel 1) = System audio (Employee's voice)
    """
    import subprocess
    import tempfile as tf

    model = _get_whisper_model()
    if model is None:
        return ""

    # Extract left channel (mic = HR)
    left_path = stereo_wav_path.replace(".wav", "_left.wav")
    # Extract right channel (system = Employee)
    right_path = stereo_wav_path.replace(".wav", "_right.wav")

    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", stereo_wav_path, "-filter_complex",
             "[0:a]channelsplit=channel_layout=stereo[FL][FR]",
             "-map", "[FL]", left_path, "-map", "[FR]", right_path],
            capture_output=True, timeout=60,
        )
    except Exception as e:
        print(f"[Diarize] Channel split failed: {e}")
        # Fallback to mono
        result = model.transcribe(stereo_wav_path, language="en")
        return result.get("text", "")

    hr_label = speaker_labels.get("SPEAKER_0", "HR")
    emp_label = speaker_labels.get("SPEAKER_1", "Employee")

    try:
        # Transcribe each channel separately WITH segments
        left_result = model.transcribe(left_path, language="en")
        right_result = model.transcribe(right_path, language="en")

        # Merge segments from both channels with speaker labels
        all_segments = []

        for seg in left_result.get("segments", []):
            text = seg["text"].strip()
            if text:
                all_segments.append({
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": text,
                    "speaker": hr_label,
                })

        for seg in right_result.get("segments", []):
            text = seg["text"].strip()
            if text:
                all_segments.append({
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": text,
                    "speaker": emp_label,
                })

        # Sort by start time
        all_segments.sort(key=lambda s: s["start"])

        # Merge consecutive segments from the same speaker
        merged = _merge_consecutive_segments(all_segments)

        # Format as labeled transcript
        lines = []
        for seg in merged:
            lines.append(f"{seg['speaker']}: {seg['text']}")

        return "\n".join(lines) if lines else ""

    finally:
        _cleanup_files(left_path, right_path)


def _diarize_mono_heuristic(wav_path: str, speaker_labels: dict) -> str:
    """
    For mono audio, use Whisper segments with silence-gap-based heuristic
    to alternate speakers. This is less accurate but works without
    additional ML models.
    
    Heuristic: Significant pauses (>1.5s) between segments likely indicate
    a speaker change in a conversational setting.
    """
    model = _get_whisper_model()
    if model is None:
        return ""

    result = model.transcribe(wav_path, language="en")
    segments = result.get("segments", [])

    if not segments:
        return result.get("text", "")

    hr_label = speaker_labels.get("SPEAKER_0", "HR")
    emp_label = speaker_labels.get("SPEAKER_1", "Employee")

    PAUSE_THRESHOLD = 1.5  # seconds of silence that indicates speaker change

    labeled_segments = []
    current_speaker = hr_label  # HR starts the call

    for i, seg in enumerate(segments):
        text = seg["text"].strip()
        if not text:
            continue

        if i > 0:
            gap = seg["start"] - segments[i - 1]["end"]
            if gap >= PAUSE_THRESHOLD:
                # Toggle speaker on significant pause
                current_speaker = emp_label if current_speaker == hr_label else hr_label

        labeled_segments.append({
            "start": seg["start"],
            "end": seg["end"],
            "text": text,
            "speaker": current_speaker,
        })

    # Merge consecutive segments from the same speaker
    merged = _merge_consecutive_segments(labeled_segments)

    lines = []
    for seg in merged:
        lines.append(f"{seg['speaker']}: {seg['text']}")

    return "\n".join(lines) if lines else result.get("text", "")


def _merge_consecutive_segments(segments: list) -> list:
    """Merge consecutive segments from the same speaker."""
    if not segments:
        return []

    merged = [segments[0].copy()]
    for seg in segments[1:]:
        if seg["speaker"] == merged[-1]["speaker"]:
            # Same speaker — merge text
            merged[-1]["text"] += " " + seg["text"]
            merged[-1]["end"] = seg["end"]
        else:
            merged.append(seg.copy())
    return merged


def _cleanup_files(*paths):
    """Remove temporary files silently."""
    for p in paths:
        try:
            if p and os.path.exists(p):
                os.remove(p)
        except Exception:
            pass
