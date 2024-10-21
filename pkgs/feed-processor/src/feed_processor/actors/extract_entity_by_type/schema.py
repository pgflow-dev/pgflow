from typing import List, Literal, TypedDict

from feed_processor.models import Bookmark
from feed_processor.models import JobPayload as BaseJobPayload
from pydantic import BaseModel, Field


class RunnableInput(TypedDict):
    input: str
    entity_type: Literal["bookmark"]
    entity_type_code: str
    extraction_rules: str
    time: str

class RunnableOutput(BaseModel):
    bookmarks: List[Bookmark] = Field(description="zero or more bookmarks. only consider something a bookmark if you are 100% sure user want to save and go back to this URL")

class JobPayload(BaseJobPayload):
    entity_type: Literal["bookmark"]

class FeedShare(BaseModel):
    content: str
    created_at: str

