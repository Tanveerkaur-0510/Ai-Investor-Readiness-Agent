"""
Pydantic schemas for request/response validation.
"""
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


# ── User Schemas ─────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class UserResponse(BaseModel):
    username: str
    email: str
    created_at: Optional[str] = None


# ── Resume Schemas ───────────────────────────────────────

class ResumeResponse(BaseModel):
    id: str
    user_email: str
    filename: str
    uploaded_at: Optional[str] = None


# ── Call Schemas ─────────────────────────────────────────

class CallCreate(BaseModel):
    call_type: str  # "interview" or "normal"
    date: str
    time: str
    participants: List[str]
    meet_link: Optional[str] = None
    user_email: Optional[str] = None
    resume_id: Optional[str] = None


class CallResponse(BaseModel):
    id: str
    call_type: str
    date: str
    time: str
    participants: List[str]
    meet_link: Optional[str] = None
    status: str = "scheduled"
    summary: Optional[str] = None
    transcript: Optional[str] = None
    rating: Optional[float] = None
    feedback: Optional[str] = None
    resume_id: Optional[str] = None
    user_email: Optional[str] = None
    created_at: Optional[str] = None


class LLMConfigSetup(BaseModel):
    llm_provider: str = "ollama"
    openai_api_key: Optional[str] = ""
    gemini_api_key: Optional[str] = ""
    ollama_model: Optional[str] = "llama3"

class ScoreHistoryResponse(BaseModel):
    id: str
    user_email: str
    filename: str
    overall_score: float
    final_status: str
    breakdown: dict
    created_at: str

class ChatRequest(BaseModel):
    doc_id: str
    message: str
