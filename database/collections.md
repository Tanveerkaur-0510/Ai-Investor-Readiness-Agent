# MongoDB Collections Schema

## `users` Collection
| Field       | Type     | Constraints          |
|-------------|----------|----------------------|
| _id         | ObjectId | Auto-generated       |
| username    | string   | Unique               |
| email       | string   | Unique, Primary Key  |
| created_at  | datetime | Auto-set on creation |

## `resumes` Collection
| Field       | Type     | Constraints             |
|-------------|----------|-------------------------|
| _id         | ObjectId | Auto-generated          |
| user_email  | string   | FK → users.email        |
| username    | string   | Denormalized for display|
| filename    | string   | Original file name      |
| filepath    | string   | Server file path        |
| file_size   | integer  | File size in bytes      |
| uploaded_at | datetime | Auto-set on creation    |

## `calls` Collection
| Field        | Type     | Constraints              |
|--------------|----------|--------------------------|
| _id          | ObjectId | Auto-generated           |
| call_type    | string   | "interview" or "normal"  |
| date         | string   | YYYY-MM-DD format        |
| time         | string   | HH:MM format             |
| participants | [string] | List of participant names|
| meet_link    | string   | Google Meet URL           |
| status       | string   | scheduled/completed/failed|
| summary      | string   | LLM-generated summary    |
| transcript   | string   | Full conversation text   |
| rating       | float    | 0-5 (interviews only)   |
| feedback     | string   | LLM feedback (interviews)|
| resume_id    | string   | ObjectId ref (interviews)|
| user_email   | string   | Primary participant email|
| created_at   | datetime | Auto-set on creation     |

## Qdrant Collection: `capital_documents`
| Field       | Type     | Description              |
|-------------|----------|--------------------------|
| id          | UUID     | Unique point ID          |
| vector      | [float]  | Embedding vector         |
| call_id     | string   | Reference to calls._id   |
| user_email  | string   | User email for filtering |
| filename    | string   | Source file name         |
| doc_type    | string   | transcript/resume/summary|
| text        | string   | Chunk text content       |
| chunk_index | integer  | Chunk position           |
