import os
import logging
from typing import Dict, List, Optional
from langchain_ollama import ChatOllama
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field
from app.core.config import settings

logger = logging.getLogger(__name__)

class ResolutionOutput(BaseModel):
    decision: str = Field(description="Either 'decline_proposed' or 'reschedule_existing' or 'decline_existing'")
    target_audience: str = Field(description="Who to reply to: 'proposed_meeting_sender' or 'existing_meeting_attendees'")
    reply_body: str = Field(description="The email body to send to the target_audience.")
    reason: str = Field(description="Brief reason for the decision based on priority.")

async def analyze_meeting_conflict_with_langchain(
    proposed_title: str, 
    existing_title: str, 
    proposed_sender: str, 
    existing_attendees: List[str]
) -> Optional[Dict]:
    """
    Uses Langchain to determine how to resolve a meeting conflict, specifically handling
    DSM (Daily Stand-up Meeting) vs high-level meetings.
    """
    api_key = settings.GEMINI_API_KEY
    
    parser = JsonOutputParser(pydantic_object=ResolutionOutput)
    
    prompt = PromptTemplate(
        template="You are an intelligent scheduling assistant. A scheduling conflict has occurred.\n"
        "Proposed Meeting: {proposed_title} (Sender: {proposed_sender})\n"
        "Existing Meeting: {existing_title} (Attendees: {existing_attendees})\n\n"
        "RULES:\n"
        "1. Priority hierarchy: High level meetings (board, investors, urgent, critical) > standard meetings > DSM (Daily Stand-up Meeting) / syncs.\n"
        "2. If the conflict involves a DSM and a higher level meeting, the higher level meeting takes priority. You should decline the DSM. Send a reply to the DSM members/sender stating: 'Today I won't be able to join.' or similar.\n"
        "3. If the conflict is between a high level meeting and a lower level meeting (not DSM), the lower level meeting should be rescheduled to another time. Send a polite reschedule request.\n\n"
        "Evaluate which meeting has higher priority. If the proposed meeting is higher priority, we may need to reschedule the existing one. If existing is higher, we decline or reschedule the proposed one.\n"
        "Decide the outcome and generate the email body to send.\n\n"
        "{format_instructions}\n",
        input_variables=["proposed_title", "existing_title", "proposed_sender", "existing_attendees"],
        partial_variables={"format_instructions": parser.get_format_instructions()}
    )
    
    input_data = {
        "proposed_title": proposed_title,
        "existing_title": existing_title,
        "proposed_sender": proposed_sender,
        "existing_attendees": ", ".join(existing_attendees) if existing_attendees else "None"
    }
    
    try:
        # First try using Ollama
        llm_ollama = ChatOllama(
            model="llama3.2",
            base_url="http://localhost:11434",
            temperature=0.2,
            format="json"  # Enable JSON mode for Ollama
        )
        chain_ollama = prompt | llm_ollama | parser
        result = await chain_ollama.ainvoke(input_data)
        return result
    except Exception as e:
        logger.warning(f"Ollama invocation failed, falling back to Gemini: {e}")
        
    if not api_key:
        logger.warning("No GEMINI_API_KEY found, cannot fall back to Gemini.")
        return None

    try:
        llm_gemini = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash", 
            google_api_key=api_key,
            temperature=0.2
        )
        chain_gemini = prompt | llm_gemini | parser
        result = await chain_gemini.ainvoke(input_data)
        return result
    except Exception as e:
        logger.error(f"Langchain meeting agent failed on Gemini fallback: {e}")
        return None
