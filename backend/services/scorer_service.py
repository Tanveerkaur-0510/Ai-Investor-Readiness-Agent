from backend.services.llm_service import generate_text
import json

async def score_startup(text: str, config: dict = None):
    # Truncate text context heavily, just the first 16,000 chars, since we handle embedding elsewhere
    text = text[:16000]

    prompt = f"""
    Please analyze the following startup pitch deck/document and evaluate if the startup is ready for investment. 
    Provide an overall score (0 to 10), final status (Ready, Needs Work, High Risk), breakdown for documentation, financials, risk, suitability (0 to 10), and a list of strengths, weaknesses, missing items, and suggestions. 
    
    Return JSON ONLY in this exact structure:
    {{
      "overall_score": 0,
      "final_status": "String",
      "breakdown": {{
        "documentation": 0,
        "financials": 0,
        "risk": 0,
        "suitability": 0
      }},
      "strengths": ["string"],
      "weaknesses": ["string"],
      "missing_items": ["string"],
      "suggestions": ["string"]
    }}

    Document:
    {text}
    """

    try:
        result = await generate_text(prompt, temperature=0.1, config=config)

        # clean markdown
        if result.strip().startswith("```"):
            result = result.split("\n", 1)[1]
        if result.strip().endswith("```"):
            result = result.rpartition("```")[0]

        # extract json
        start = result.find("{")
        end = result.rfind("}") + 1
        result = result[start:end]

        return json.loads(result)

    except Exception as e:
        print("SCORING ERROR:", e)

        return {
            "overall_score": 0,
            "final_status": "High Risk",
            "breakdown": {
                "documentation": 0,
                "financials": 0,
                "risk": 0,
                "suitability": 0
            },
            "strengths": [],
            "weaknesses": ["AI parsing significantly failed."],
            "missing_items": ["The document could not be processed effectively."],
            "suggestions": ["Please retry the upload or contact support."]
        }