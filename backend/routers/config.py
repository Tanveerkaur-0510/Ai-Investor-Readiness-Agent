from fastapi import APIRouter, HTTPException, Depends, Header
from backend.database import db, configs_collection
from backend.schemas import LLMConfigSetup
from backend.routers.auth import get_current_user
from typing import Optional

router = APIRouter()

@router.get("/api/config", response_model=LLMConfigSetup)
async def get_config(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.replace("Bearer ", "")
    user = await get_current_user(token)
    if configs_collection is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    
    config = await configs_collection.find_one({"user_email": user["email"]})
    if config:
        return LLMConfigSetup(**config)
    
    # Default config
    return LLMConfigSetup()

@router.post("/api/config", response_model=LLMConfigSetup)
async def update_config(config: LLMConfigSetup, authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.replace("Bearer ", "")
    user = await get_current_user(token)
    if configs_collection is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    
    config_dict = config.model_dump()
    config_dict["user_email"] = user["email"]
    
    await configs_collection.update_one(
        {"user_email": user["email"]},
        {"$set": config_dict},
        upsert=True
    )
    
    return config
