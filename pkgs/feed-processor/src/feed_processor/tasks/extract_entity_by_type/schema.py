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
    """
    Extract all usable links that User may want to revisit later.
    Do not skip anything that has a valid URL.
    Generate meaningful but concise titles
    """
    entities: List[Bookmark] = Field(description="zero or more bookmarks. only consider something a bookmark if you are 100% sure user want to save and go back to this URL. Must have URL and you must create title")

class JobPayload(BaseJobPayload):
    entity_type: Literal["bookmark"]

