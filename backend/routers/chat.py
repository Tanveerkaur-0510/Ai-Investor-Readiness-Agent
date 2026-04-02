from fastapi import APIRouter, HTTPException, Depends, Header
from backend.database import db, scores_collection
from backend.schemas import ChatRequest
from backend.routers.auth import get_current_user
from backend.services.vector_service import search_documents
from backend.services.llm_service import generate_text

router = APIRouter()

@router.post("/api/chat")
async def chat_document(request: ChatRequest, authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    
    token = authorization.replace("Bearer ", "")
    user = await get_current_user(token)
    
    # Validate that this user actually owns this score/document
    if scores_collection is None:
        raise HTTPException(status_code=500, detail="Database not connected")
        
    doc_record = await scores_collection.find_one({"id": request.doc_id, "user_email": user["email"]})
    if not doc_record:
        raise HTTPException(status_code=404, detail="Document not found or access denied")
        
    # Retrieve contextual chunks from Qdrant
    results = await search_documents(query=request.message, user_email=user["email"], call_id=request.doc_id, top_k=5)
    
    context_text = "\n\n".join([r["payload"]["text"] for r in results]) if results else "No specific context found in document."
    
    score_context = f"""
    Document Name: {doc_record.get('filename')}
    Overall Score: {doc_record.get('overall_score')} / 10
    Final Status: {doc_record.get('final_status')}
    Strengths: {doc_record.get('strengths')}
    Weaknesses: {doc_record.get('weaknesses')}
    Missing Items: {doc_record.get('missing_items')}
    """
    
    system_prompt = f"""
    You are an AI investment analyst explaining the scores given to a specific document to the user.
    The user is asking a question about their pitch deck evaluation.
    
    Here is the scorecard for this document:
    {score_context}
    
    Here are relevant snippets retrieved from the uploaded document itself:
    {context_text}
    
    Answer the user's question clearly, concisely, and based ONLY on the provided context and scorecard. 
    If the answer is not in the context, state that you cannot answer it accurately.
    """
    
    try:
        response_text = await generate_text(prompt=request.message, system=system_prompt, temperature=0.3)
        return {"response": response_text}
    except Exception as e:
        print("Chat Error:", e)
        raise HTTPException(status_code=500, detail="Could not generate AI response")
