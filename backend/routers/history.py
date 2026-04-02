from fastapi import APIRouter, HTTPException, Depends, Header
from backend.database import db, scores_collection
from backend.schemas import ScoreHistoryResponse
from backend.routers.auth import get_current_user
from typing import List

router = APIRouter()

@router.get("/api/history", response_model=List[ScoreHistoryResponse])
async def get_history(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.replace("Bearer ", "")
    user = await get_current_user(token)
    if scores_collection is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    
    cursor = scores_collection.find({"user_email": user["email"]}).sort("created_at", -1)
    history = await cursor.to_list(length=100)
    
    result = []
    for item in history:
        if "_id" in item:
            del item["_id"]
        result.append(ScoreHistoryResponse(**item))
        
    return result
