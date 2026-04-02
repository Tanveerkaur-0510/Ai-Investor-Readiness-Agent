from __future__ import annotations
"""
LLM Service — Hardcoded to OpenAI per user request.
"""
import json
import openai
from backend.config import settings

def _get_openai_client():
    if not settings.OPENAI_API_KEY:
        raise ValueError("Missing OpenAI API key in settings.")
    return openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


async def generate_text(prompt: str, system: str = "", temperature: float = 0.3, config: dict = None) -> str:
    """Generate text using OpenAI gpt-4o-mini."""
    client = _get_openai_client()
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=temperature,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt}
            ]
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"OpenAI generate error: {e}")
        return f"Error: {e}"


async def get_embeddings(text: str, config: dict = None) -> list[float]:
    """Get text embeddings using OpenAI text-embedding-3-small."""
    client = _get_openai_client()
    try:
        response = await client.embeddings.create(
            input=[text],
            model="text-embedding-3-small"
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"OpenAI embedding error: {e}")
        return []
