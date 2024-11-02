from json import loads as parse_json
from typing import Union

from pgqueuer.models import Job
from pydantic import BaseModel, Field


class JobPayload(BaseModel):
    schema_name: str
    table_name: str
    id: str

    @classmethod
    def from_job(cls, job: Job):
        assert job.payload, "No payload in job"

        return cls(**parse_json(job.payload.decode()))

class Event(BaseModel):
    """Event: any calendar-like events with specific date and optional time and place"""

    datetime: str = Field(description="Date of event")
    title: str = Field(description="Title or name of the event - must be informative enough")
    place: str = Field(description="Place of the event - as precise as possible from avaialble informtion")
    description: str = Field(description="Any additional info that is not place time or title")

class Video(BaseModel):
    """Video: any youtube and other videos"""

    url: str = Field(description="URL of the video")
    title: str = Field(description="Title of the video")

class Snippet(BaseModel):
    """Snippet: any code or monospace related content"""

    source: str = Field(description="Whole source code of the snippet")
    language_code: str = Field(description="Language of the source code as lowercase simple identifier: 'ruby', 'python', 'java' etc")

class Bookmark(BaseModel):
    """
    Links to stuff that user pasted or want to revisit later.
    plainoldurls.com, [Markdown](https://links.com), https://urls-with-proto.com etc.
    Do not skip anything but do not consider every link a bookmark: for example, urls to
    static assets in html code are not a bookmark.
    But a link to other article mentioned in content of original article is a bookmark.
    """

    short_summary: str = Field(description="Few word summary of a destination")
    url: str = Field(description="URL of the link")
    title: str = Field(description="Title of the link")

class Text(BaseModel):
    """Text: just text, for everything else"""

    text: str = Field(description="Text of the content")

UiProps = Union[Event, Video, Snippet, Bookmark, Text]

AttributesSchemaByType = {
    "event": Event,
    "video": Video,
    "snippet": Snippet,
    "bookmark": Bookmark,
    "text": Text
}

from dataclasses import dataclass

from asyncpg import Pool
from asyncpg.connection import Connection
from pgqueuer.db import AsyncpgDriver, AsyncpgPoolDriver
from pgqueuer.models import Job
from pgqueuer.qm import QueueManager
from pgqueuer.queries import Queries
from pydantic import SecretStr
from supabase.client import Client as SupabaseClient


@dataclass
class JobContext:
    supabase: SupabaseClient
    connection: Connection
    driver: AsyncpgDriver
    pool: Pool
    qm: QueueManager
    queries: Queries
    openai_api_key: SecretStr
    groq_api_key: SecretStr
    anthropic_api_key: SecretStr
