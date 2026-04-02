"""
Database setup for MongoDB and Qdrant.
"""
import certifi
from motor.motor_asyncio import AsyncIOMotorClient
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from backend.config import settings

# ── MongoDB Connection ───────────────────────────────────
try:
    # Only use TLS/certifi for remote MongoDB (Atlas etc.)
    if "localhost" in settings.MONGODB_URL or "127.0.0.1" in settings.MONGODB_URL:
        mongo_client = AsyncIOMotorClient(settings.MONGODB_URL)
    else:
        mongo_client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            tlsCAFile=certifi.where()
        )
    db = mongo_client[settings.DATABASE_NAME]
    users_collection = db["users"]
    configs_collection = db["configs"]
    scores_collection = db["scores"]
except Exception as e:
    print(f"Warning: Could not connect to MongoDB at {settings.MONGODB_URL}: {e}")
    db = None
    users_collection = None
    configs_collection = None
    scores_collection = None

# ── Qdrant Connection ───────────────────────────────────
try:
    qdrant_client = QdrantClient(
        url=settings.QDRANT_URL,
        api_key=settings.QDRANT_API_KEY if settings.QDRANT_API_KEY else None,
    )
    print(f"Qdrant connected: {qdrant_client.get_collections()}")
except Exception as e:
    print(f"Warning: Could not connect to Qdrant at {settings.QDRANT_URL}: {e}")
    qdrant_client = None


def get_db():
    """Yields the MongoDB database object."""
    yield db


async def init_db():
    """Initialize collections and indexes. Non-fatal if DBs are unavailable."""
    if db is not None:
        try:
            import pymongo

            # Users collection indexes
            await db.users.create_index("email", unique=True)
            await db.users.create_index("username", unique=True)

            # Extra indexes
            await db.configs.create_index("user_email", unique=True)
            await db.scores.create_index("user_email")

            print("MongoDB indexes created successfully.")
        except Exception as e:
            print(f"Warning: MongoDB index creation failed (is MongoDB running?): {e}")

    # Determine embedding dimension based on provider
    if settings.LLM_PROVIDER == "gemini":
        embed_dim = 3072  # Gemini embedding dimension
    else:
        embed_dim = 768   # Ollama nomic-embed-text dimension

    if qdrant_client is not None:
        try:
            collections = qdrant_client.get_collections().collections
            collection_names = [c.name for c in collections]

            if "capital_documents" not in collection_names:
                qdrant_client.create_collection(
                    collection_name="capital_documents",
                    vectors_config=VectorParams(size=embed_dim, distance=Distance.COSINE),
                )
                print("Created Qdrant collection 'capital_documents'.")

            # Ensure payload index
            from qdrant_client.models import PayloadSchemaType
            qdrant_client.create_payload_index(
                collection_name="capital_documents",
                field_name="user_email",
                field_schema=PayloadSchemaType.KEYWORD,
            )
            print("Qdrant indexes created successfully.")
        except Exception as e:
            print(f"Could not init Qdrant collection/index: {e}")

