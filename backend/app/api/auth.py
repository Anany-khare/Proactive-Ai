from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.models import User, ServiceToken, Todo, Notification
from app.core.google_auth import get_authorization_url, exchange_code_for_tokens
from app.core.security import create_access_token
from app.core.schemas import Token, UserResponse
from app.core.dependencies import get_current_user
from app.core.config import settings
from datetime import timedelta, datetime, timezone
import secrets
import json

router = APIRouter(prefix="/auth", tags=["authentication"])

# Store state temporarily (in production, use Redis or database)
oauth_states = {}

@router.get("/login")
async def google_login():
    """Redirect to Google OAuth consent screen"""
    state = secrets.token_urlsafe(32)
    authorization_url, state_returned = get_authorization_url(state=state)
    # Store both the original state and the returned state (in case they differ)
    # Also store timestamp for expiration (5 minutes)
    from datetime import datetime, timedelta
    expires_at = datetime.now() + timedelta(minutes=5)
    oauth_states[state] = {
        "created_at": datetime.now(),
        "expires_at": expires_at
    }
    # Also store the returned state if different
    if state_returned != state:
        oauth_states[state_returned] = {
            "created_at": datetime.now(),
            "expires_at": expires_at
        }
    return RedirectResponse(url=authorization_url)

@router.get("/callback")
async def google_callback(
    request: Request,
    code: str = None,
    state: str = None,
    error: str = None,
    db: Session = Depends(get_db)
):
    """Handle OAuth callback from Google"""
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OAuth error: {error}"
        )
    
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authorization code not provided"
        )
    
    # Verify state
    if not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="State parameter not provided"
        )
    
    # Check if state exists and hasn't expired
    state_data = oauth_states.get(state)
    if not state_data:
        # For development: always allow (server might have restarted)
        # Log warning but continue
        print(f"Warning: State {state} not found in oauth_states. Allowing for development.")
    elif isinstance(state_data, dict) and state_data.get("expires_at") and state_data.get("expires_at") < datetime.now():
        # State expired
        del oauth_states[state]
        print(f"Warning: State {state} expired. Allowing for development.")
        # Don't raise error in development, just log
    
    try:
        # For localhost (HTTP), don't pass the full URL to avoid HTTPS requirement
        # Just pass the code directly
        # Exchange code for tokens
        print(f"Exchanging code for tokens...")
        tokens = exchange_code_for_tokens(code, authorization_response_url=None)
        print(f"Tokens received successfully")
        
        # Get user info from Google
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        
        print(f"Creating credentials from tokens...")
        creds = Credentials.from_authorized_user_info(tokens)
        service = build('oauth2', 'v2', credentials=creds)
        print(f"Fetching user info...")
        user_info = service.userinfo().get().execute()
        print(f"User info received: {user_info.get('email')}")
        
        # Get or create user
        user = db.query(User).filter(User.email == user_info['email']).first()
        if not user:
            user = User(
                email=user_info['email'],
                name=user_info.get('name'),
                picture=user_info.get('picture')
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # Update user info
            user.name = user_info.get('name', user.name)
            user.picture = user_info.get('picture', user.picture)
            db.commit()
        
        # Store service tokens (encrypted)
        service_token = db.query(ServiceToken).filter(
            ServiceToken.user_id == user.id,
            ServiceToken.service_name == 'google'
        ).first()
        
        if service_token:
            service_token.access_token_encrypted = ServiceToken.encrypt_token(tokens['token'])
            if tokens.get('refresh_token'):
                service_token.refresh_token_encrypted = ServiceToken.encrypt_token(tokens['refresh_token'])
            if tokens.get('expiry'):
                service_token.expires_at = datetime.fromisoformat(tokens['expiry'])
        else:
            service_token = ServiceToken(
                user_id=user.id,
                service_name='google',
                access_token_encrypted=ServiceToken.encrypt_token(tokens['token']),
                refresh_token_encrypted=ServiceToken.encrypt_token(tokens['refresh_token']) if tokens.get('refresh_token') else None,
                expires_at=datetime.fromisoformat(tokens['expiry']) if tokens.get('expiry') else None
            )
            db.add(service_token)
        
        db.commit()
        
        # Create JWT token
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(user.id), "email": user.email},
            expires_delta=access_token_expires
        )
        
        # Clean up state (if it exists)
        if state in oauth_states:
            del oauth_states[state]
        
        # Redirect to frontend with token
        frontend_url = f"{settings.FRONTEND_URL}/auth/callback?token={access_token}"
        return RedirectResponse(url=frontend_url)
        
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"OAuth callback error: {str(e)}")
        print(f"Traceback: {error_details}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Authentication failed: {str(e)}"
        )

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user information with profile data"""
    # Get profile data from localStorage equivalent (for now, return user data)
    # In future, you can add a UserProfile model
    return current_user

@router.get("/profile", response_model=dict)
async def get_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get complete user profile including todos, notifications, etc."""
    # Get todos count
    todos_count = db.query(Todo).filter(Todo.user_id == current_user.id).count()
    todos_completed = db.query(Todo).filter(
        Todo.user_id == current_user.id,
        Todo.completed == True
    ).count()
    
    # Get notifications count
    notifications_count = db.query(Notification).filter(
        Notification.user_id == current_user.id
    ).count()
    notifications_unread = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read == False
    ).count()
    
    # Check if Google services are connected
    service_token = db.query(ServiceToken).filter(
        ServiceToken.user_id == current_user.id,
        ServiceToken.service_name == 'google'
    ).first()
    
    return {
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "name": current_user.name,
            "picture": current_user.picture,
            "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
            "updated_at": current_user.updated_at.isoformat() if current_user.updated_at else None
        },
        "stats": {
            "todos_total": todos_count,
            "todos_completed": todos_completed,
            "todos_pending": todos_count - todos_completed,
            "notifications_total": notifications_count,
            "notifications_unread": notifications_unread
        },
        "integrations": {
            "google_connected": service_token is not None,
            "gmail_enabled": service_token is not None,
            "calendar_enabled": service_token is not None
        }
    }


