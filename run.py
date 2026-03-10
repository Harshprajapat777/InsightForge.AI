# -*- coding: utf-8 -*-
"""
run.py - InsightForge.AI server launcher
Run from project root: python run.py

The folder name 'InsightForge.AI' contains a dot which breaks Python's
standard module import (uvicorn "InsightForge.AI.backend.main:app" fails).
This script adds the app directory to sys.path and launches uvicorn directly.
"""

import sys
import asyncio
import nest_asyncio
from pathlib import Path

# Must apply BEFORE uvicorn/FastAPI start.
# On Linux with uvloop, there is no default event loop in the main thread —
# explicitly create one before nest_asyncio.apply() to avoid RuntimeError.
asyncio.set_event_loop(asyncio.new_event_loop())
nest_asyncio.apply()

# Add InsightForge.AI/ to path so 'backend.main' resolves correctly
APP_DIR = Path(__file__).parent / "InsightForge.AI"
sys.path.insert(0, str(APP_DIR))

import os
import uvicorn
from backend.main import app  # noqa: E402 — must come after sys.path insert

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        loop="asyncio",     # force stdlib asyncio — uvloop conflicts with nest_asyncio
        reload=False,       # reload=True breaks with dynamic sys.path
        log_level="info",
    )
