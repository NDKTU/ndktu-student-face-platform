from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

ClientLogLevel = Literal["warn", "error"]
ClientLogSource = Literal["console", "window.onerror", "unhandledrejection", "error-boundary"]


class ClientLogEntry(BaseModel):
    level: ClientLogLevel
    message: str = Field(min_length=1, max_length=2000)
    stack: Optional[str] = Field(default=None, max_length=8000)
    url: Optional[str] = Field(default=None, max_length=2000)
    user_agent: Optional[str] = Field(default=None, max_length=500)
    source: Optional[ClientLogSource] = None
    component_stack: Optional[str] = Field(default=None, max_length=8000)
    extra: Optional[dict] = None
    timestamp: Optional[str] = None


class ClientLogBatchRequest(BaseModel):
    entries: list[ClientLogEntry] = Field(min_length=1, max_length=25)
