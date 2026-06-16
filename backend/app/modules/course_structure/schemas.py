from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class TopicCreateRequest(BaseModel):
    module_id: int
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    order_index: int = 0
    hours: Optional[int] = Field(default=None, ge=0)
    learning_outcomes: Optional[str] = None


class TopicUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    order_index: Optional[int] = None
    hours: Optional[int] = Field(default=None, ge=0)
    learning_outcomes: Optional[str] = None


class TopicResponse(BaseModel):
    id: int
    module_id: int
    name: str
    description: Optional[str] = None
    order_index: int
    hours: Optional[int] = None
    learning_outcomes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ModuleCreateRequest(BaseModel):
    course_id: int
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    order_index: int = 0


class ModuleUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    order_index: Optional[int] = None


class ModuleResponse(BaseModel):
    id: int
    course_id: int
    name: str
    description: Optional[str] = None
    order_index: int
    topics: List[TopicResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ModuleListResponse(BaseModel):
    modules: List[ModuleResponse]


class ReorderItem(BaseModel):
    id: int
    order_index: int


class ReorderRequest(BaseModel):
    items: List[ReorderItem]
