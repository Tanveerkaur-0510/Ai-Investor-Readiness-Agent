from __future__ import annotations
"""
Vector Service — Qdrant embedding storage and search.
Supports both Gemini and Ollama embeddings.
"""
import uuid
import pdfplumber
from backend.database import qdrant_client
from backend.config import settings
from backend.services.llm_service import get_embeddings
from qdrant_client.models import PointStruct


def extract_text_from_pdf(filepath: str) -> str:
    """Extract text from a PDF file."""
    text = ""
    try:
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text += t + "\n"
    except Exception as e:
        print(f"Error reading PDF {filepath}: {e}")
    return text


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 100) -> list[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    text_len = len(text)
    while start < text_len:
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks


async def store_document_embeddings(
    call_id: str,
    user_email: str,
    filepath: str,
    filename: str,
    doc_type: str = "transcript",
    config: dict = None
):
    """Store document embeddings in Qdrant."""
    if not qdrant_client:
        print("Qdrant client not available.")
        return

    text = ""
    if filepath.lower().endswith('.pdf'):
        text = extract_text_from_pdf(filepath)
    elif filepath.lower().endswith('.txt'):
        try:
            with open(filepath, 'r') as f:
                text = f.read()
        except Exception:
            pass

    if not text.strip():
        return

    chunks = chunk_text(text)
    points = []

    try:
        for i, chunk in enumerate(chunks):
            embedding = await get_embeddings(chunk, config=config)
            if embedding:
                points.append(
                    PointStruct(
                        id=str(uuid.uuid4()),
                        vector=embedding,
                        payload={
                            "call_id": call_id,
                            "user_email": user_email,
                            "filename": filename,
                            "doc_type": doc_type,
                            "text": chunk,
                            "chunk_index": i,
                        }
                    )
                )
        if points:
            qdrant_client.upsert(
                collection_name="capital_documents",
                points=points,
            )
            print(f"Stored {len(points)} chunks in Qdrant for {filename}")
    except Exception as e:
        print(f"Error embedding/storing document: {e}")


async def store_text_embeddings(
    call_id: str,
    user_email: str,
    text: str,
    source_label: str = "transcript",
    config: dict = None
):
    """Embed plain text into Qdrant for RAG search."""
    if not qdrant_client:
        print("Qdrant client not available.")
        return
    if not text.strip():
        return

    chunks = chunk_text(text)
    points = []

    try:
        for i, chunk in enumerate(chunks):
            embedding = await get_embeddings(chunk, config=config)
            if embedding:
                points.append(
                    PointStruct(
                        id=str(uuid.uuid4()),
                        vector=embedding,
                        payload={
                            "call_id": call_id,
                            "user_email": user_email,
                            "filename": source_label,
                            "doc_type": source_label,
                            "text": chunk,
                            "chunk_index": i,
                        }
                    )
                )
        if points:
            qdrant_client.upsert(
                collection_name="capital_documents",
                points=points,
            )
            print(f"Stored {len(points)} text chunks in Qdrant (source: {source_label})")
    except Exception as e:
        print(f"Error embedding/storing text: {e}")


async def search_documents(query: str, user_email: str = None, call_id: str = None, top_k: int = 5, config: dict = None) -> list[dict]:
    """Search Qdrant for relevant document chunks."""
    if not qdrant_client:
        return []

    try:
        embedding = await get_embeddings(query, config=config)
        if not embedding:
            return []

        search_params = {
            "collection_name": "capital_documents",
            "query_vector": embedding,
            "limit": top_k,
        }

        must_conditions = []
        if user_email:
            must_conditions.append(FieldCondition(key="user_email", match=MatchValue(value=user_email)))
        if call_id:
            must_conditions.append(FieldCondition(key="call_id", match=MatchValue(value=call_id)))

        if must_conditions:
            search_params["query_filter"] = Filter(must=must_conditions)

        results = qdrant_client.search(**search_params)
        return [{"score": r.score, "payload": r.payload} for r in results]
    except Exception as e:
        print(f"Error searching Qdrant: {e}")
        return []
