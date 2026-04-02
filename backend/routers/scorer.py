from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Header
from backend.services.scorer_service import score_startup
from backend.services.vector_service import store_document_embeddings
from backend.routers.auth import get_current_user
from backend.database import db, scores_collection, configs_collection
from datetime import datetime
import uuid
import os
import pdfplumber

router = APIRouter()

@router.post("/api/score")
async def score(
    file: UploadFile = File(...),
    authorization: str = Header(None)
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    
    token = authorization.replace("Bearer ", "")
    user = await get_current_user(token)
    
    try:
        config = None
        if configs_collection is not None:
            config = await configs_collection.find_one({"user_email": user["email"]})
            
        print("STEP 1: File received:", file.filename)
        
        temp_id = str(uuid.uuid4())
        filepath = f"temp_{temp_id}.pdf"
        
        content = await file.read()
        
        import hashlib
        file_hash = hashlib.md5(content).hexdigest()
        
        if scores_collection is not None:
            existing = await scores_collection.find_one({
                "user_email": user["email"],
                "file_hash": file_hash
            })
            if existing:
                return {"error": f"You have already analyzed this exact document. Please view your History tab."}
        
        with open(filepath, "wb") as f:
            f.write(content)
            
        text = ""
        try:
            with pdfplumber.open(filepath) as pdf:
                for page in pdf.pages:
                    text += page.extract_text() or ""
        except Exception as pe:
            print("PDF Parse error:", pe)
            
        print("STEP 2: Text extracted length:", len(text))
        
        result = await score_startup(text, config=config)
        print("STEP 3: AI Scoring done")
        
        doc_id = str(uuid.uuid4())
        score_record = {
            "id": doc_id,
            "user_email": user["email"],
            "filename": file.filename,
            "file_hash": file_hash,
            "overall_score": float(result.get("overall_score", 0)),
            "final_status": result.get("final_status", "Needs Work"),
            "breakdown": result.get("breakdown", {}),
            "created_at": datetime.utcnow().isoformat()
        }
        
        if scores_collection is not None:
            await scores_collection.insert_one(score_record.copy())
            
        # Store embeddings in Vector DB
        await store_document_embeddings(
            call_id=doc_id,
            user_email=user["email"],
            filepath=filepath,
            filename=file.filename,
            doc_type="pitch_deck",
            config=config
        )
        
        if os.path.exists(filepath):
            os.remove(filepath)
            
        return result
    except Exception as e:
        print("❌ ERROR:", str(e))
        return {"error": str(e)}