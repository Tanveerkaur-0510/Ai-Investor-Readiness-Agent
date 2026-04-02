"""
One-time script to generate token.json for Google Calendar & Gmail APIs.
Run this once: python3 generate_token.py
It will open a browser for you to sign in and grant permissions.
"""
import os
import json
from dotenv import load_dotenv

load_dotenv()

SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
]


def main():
    from google_auth_oauthlib.flow import InstalledAppFlow

    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        print("❌ Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env")
        print("   Go to https://console.cloud.google.com → APIs & Services → Credentials")
        return

    # Build client config from env vars
    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"],
        }
    }

    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    creds = flow.run_local_server(port=8090)

    # Save token
    with open("token.json", "w") as f:
        f.write(creds.to_json())

    print("✅ token.json created successfully!")
    print("   Google Calendar & Gmail APIs are now authorized.")
    print("   You can now restart the server and schedule Google Meet calls.")


if __name__ == "__main__":
    main()
