from fastapi import APIRouter, HTTPException, Depends, status, Header
from pydantic import BaseModel
from datetime import datetime, timedelta
import bcrypt
from jose import JWTError, jwt
from backend.database import db, users_collection
from backend.schemas import UserCreate, UserLogin, Token, UserResponse
from backend.config import settings
from typing import Optional

router = APIRouter()

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    if users_collection is not None:
        user = await users_collection.find_one({"email": email})
        if user is None:
            raise credentials_exception
        return user
    return {"email": email}


@router.post("/api/auth/register", response_model=UserResponse)
async def register(user: UserCreate):
    if users_collection is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    
    existing = await users_collection.find_one({
        "$or": [{"email": user.email}, {"username": user.username}]
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="User with email or username already exists")
    
    user_dict = user.model_dump()
    user_dict["password"] = get_password_hash(user_dict.pop("password"))
    user_dict["created_at"] = datetime.utcnow().isoformat()
    
    await users_collection.insert_one(user_dict)
    
    return UserResponse(username=user.username, email=user.email, created_at=user_dict["created_at"])


@router.post("/api/auth/login", response_model=Token)
async def login(user_login: UserLogin):
    if users_collection is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    
    user = await users_collection.find_one({"email": user_login.email})
    
    if not user or not verify_password(user_login.password, user["password"]):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["email"]}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/api/auth/me", response_model=UserResponse)
async def read_users_me(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.replace("Bearer ", "")
    user = await get_current_user(token)
    return UserResponse(username=user.get("username", "Unknown"), email=user.get("email"), created_at=user.get("created_at"))
