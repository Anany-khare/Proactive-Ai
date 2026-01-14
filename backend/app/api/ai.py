from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/ai", tags=["ai"])

class GenerateReplyRequest(BaseModel):
    email_body: str
    context: Optional[str] = None

class GenerateReplyResponse(BaseModel):
    reply_text: str

@router.post("/generate-reply", response_model=GenerateReplyResponse)
async def generate_reply(request: GenerateReplyRequest):
    """
    Generate a reply for a given email body.
    Currently used as a placeholder mock since no AI keys are configured.
    """
    original_text = request.email_body.lower()
    
    # Simple rule-based generation (Mock AI)
    if "urget" in original_text or "asap" in original_text:
        reply = "I received your urgent message and will get back to you as soon as possible."
    elif "meeting" in original_text or "schedule" in original_text:
        reply = "Thanks for the invite. I'll check my calendar and confirm shortly."
    elif "thank" in original_text:
        reply = "You're welcome! Let me know if you need anything else."
    else:
        reply = "Thank you for your email. I have received it and will review it shortly."
        
    return GenerateReplyResponse(reply_text=reply)
