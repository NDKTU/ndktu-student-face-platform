from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class LiteratureItem(BaseModel):
    title: str
    author: Optional[str] = None
    year: Optional[int] = None
    type: Optional[str] = None


class SyllabusUpsertRequest(BaseModel):
    goals: Optional[str] = None
    learning_outcomes: Optional[str] = None
    prerequisites: Optional[str] = None
    methodical_recommendations: Optional[str] = None
    literature: List[LiteratureItem] = []
    grading_scheme: Dict[str, int] = {}
    competencies: List[str] = []
    file_url: Optional[str] = None
    file_name: Optional[str] = None


class SyllabusResponse(BaseModel):
    id: int
    course_id: int
    goals: Optional[str] = None
    learning_outcomes: Optional[str] = None
    prerequisites: Optional[str] = None
    methodical_recommendations: Optional[str] = None
    literature: List[LiteratureItem] = []
    grading_scheme: Dict[str, int] = {}
    competencies: List[str] = []
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
