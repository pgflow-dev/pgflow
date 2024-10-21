from typing import Literal, TypedDict

from feed_processor.models import Bookmark
from feed_processor.models import JobPayload as BaseJobPayload
from pydantic import BaseModel


class RunnableInput(TypedDict):
    input: str
    entity_type: Literal["bookmark"]
    entity_type_code: str
    extraction_rules: str
    time: str

RunnableOutput = Bookmark

class JobPayload(BaseJobPayload):
    entity_type: Literal["bookmark"]

class FeedShare(BaseModel):
    content: str
    created_at: str

