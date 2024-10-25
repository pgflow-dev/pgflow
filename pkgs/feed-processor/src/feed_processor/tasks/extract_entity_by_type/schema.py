from json import loads as parse_json
from typing import List, Literal, Optional, TypedDict, Union

from pgqueuer.models import Job
from pydantic import BaseModel, Field

EntityType = Literal["bookmark", "code_snippet", "event", "todo", "note", "person"]

class RunnableInput(TypedDict):
    input: str
    entity_type: EntityType
    entity_type_code: str
    extraction_rules: str
    time: str

class JobPayload(BaseModel):
    schema_name: str
    table_name: str
    id: str
    entity_type: EntityType

    @classmethod
    def from_job(cls, job: Job):
        assert job.payload, "No payload in job"

        return cls(**parse_json(job.payload.decode()))

####################### models to extract #####################
ReasonField = Field(..., description="Reason you think this entity should be extracted")
ShortSumaryField = Field(..., description="The short and vague overview/outline of the entity, only few words")
TagsField = Field(..., description="List of tags associated with the entity")

class Bookmark(BaseModel):
    """
    Links to stuff that user pasted or want to revisit later.
    plainoldurls.com, [Markdown](https://links.com), https://urls-with-proto.com etc.
    Do not skip anything but do not consider every link a bookmark: for example, urls to
    static assets in html code are not a bookmark.
    But a link to other article mentioned in content of original article is a bookmark.
    """
    is_bookmark: bool
    reason: str = ReasonField
    url: str = Field(..., description="The URL of the bookmarked webpage")
    title: str = Field(..., description="The title of the bookmarked webpage")
    short_summary: str = ShortSumaryField
    tags: List[str] = TagsField

    @property
    def table_name(self): return "bookmarks"

    def to_supabase_dict(self):
        return {
            "url": self.url,
            "title": self.title,
            "short_summary": self.short_summary,
            "tags": self.tags
        }

class CodeSnippet(BaseModel):
    """
    Represents a code snippet extracted from the input.
    This class captures various attributes of a code snippet, including the source code,
    programming language, description, and associated tags.
    """
    is_snippet: bool
    reason: str = ReasonField
    source: str = Field(..., description="The source code of the snippet")
    language_code: str = Field(..., description="The programming language of the snippet (e.g., typescript, python, ruby, html)")
    description: str = Field(..., description="The description or any label for the snippet")
    short_summary: str = ShortSumaryField
    tags: List[str] = TagsField

    @property
    def table_name(self): return "code_snippets"

    def to_supabase_dict(self):
        return {
            "source": self.source,
            "language_code": self.language_code,
            "description": self.description,
            "short_summary": self.short_summary,
            "tags": self.tags
        }

class Event(BaseModel):
    """
    Represents an event extracted from the input.
    This class captures various attributes of an event, including the time, place,
    title, description, and associated tags.

    Events can be extracted from various types of text, such as:
    1. Calendar entries or schedules
    2. Meeting invitations or announcements
    3. Social media posts about upcoming gatherings
    4. News articles mentioning future events
    5. Personal notes or reminders about appointments
    6. Conference or workshop announcements
    7. Cultural or sports event listings
    8. Public holiday notifications
    9. Academic or professional deadlines
    10. Travel itineraries or flight information

    The event should have a clear time component and optionally a location.
    """
    is_event: bool
    reason: str = ReasonField
    time: str = Field(..., description="The date and time of the event in ISO 8601 format")
    place: Optional[str] = Field(..., description="The location where the event takes place")
    title: str = Field(..., description="The title or name of the event")
    description: Optional[str] = Field(..., description="A brief description of the event")
    short_summary: str = ShortSumaryField
    tags: List[str] = TagsField

    @property
    def table_name(self): return "events"

    def to_supabase_dict(self):
        return {
            "time": self.time,
            "place": self.place,
            "title": self.title,
            "description": self.description,
            "short_summary": self.short_summary,
            "tags": self.tags
        }

class Todo(BaseModel):
    """
    Represents a todo item extracted from the input.
    This class captures various attributes of a todo, including the title,
    short summary, and associated tags.

    Todos are personal tasks that the user needs to complete.
    They are typically short, specific, and action-oriented.
    Unlike events, todos are NEVER tied to a specific time or place.
    NEVER create todos for content that looks like Events and has a time/date.

    Examples of todos:
    1. "Buy groceries"
    2. "Call mom"
    3. "Finish report for work"
    4. "Schedule dentist appointment"
    5. "Pay electricity bill"

    Examples of events that should not be treated as todos:
    1. "Dentist tomorrow at 7pm" (because it has a date and time)
    2. "Meeting with Joe next monday" (because it has a date)
    3. "i think im gonna meet with parents later today" (becasue it has time)

    Be very intelligent about extracting date and time:
    - if user provide only a Date, figure out what would be appropriate time for this kind of event
        example: "dinner with Joe on monday" - assume dinner is at 1pm (and similar)
    - if user provide only a Time, figure out if he talks about today maybe?
        example: "call mom at 8pm" - if 8pm is after current time, assume its today
    """
    is_todo: bool
    reason: str = ReasonField
    title: str = Field(..., description="The title or description of the todo item")
    due_date: Optional[str] = Field(..., description="The due date of the todo item in ISO 8601 format")
    short_summary: str = ShortSumaryField
    tags: List[str] = TagsField
    @property
    def table_name(self): return "todos"

    def to_supabase_dict(self):
        return {
            "title": self.title,
            "due_date": self.due_date,
            "short_summary": self.short_summary,
            "tags": self.tags
        }

class Note(BaseModel):
    is_note: bool
    reason: str = ReasonField
    text: str = Field(..., description="The text of the note, journal entry or loose thought")
    short_summary: str = ShortSumaryField
    tags: List[str] = TagsField

    @property
    def table_name(self): return "notes"

    def to_supabase_dict(self):
        return {
            "text": self.text,
            "short_summary": self.short_summary,
            "tags": self.tags
        }

class Person(BaseModel):
    """
    Represents a person extracted from the input.
    This class captures basic attributes of a person, including their gender and name.
    It can be used to store information about individuals mentioned in various contexts,
    such as contacts, characters in a story, or people referenced in documents.
    """
    gender: Literal["male", "female"] = Field(description="Gender of the person")
    name_or_nickname: str = Field(description="Name or nickname of the person - how one call him/her")
    occupation: str = Field(description="Occupation of the person")
    relation_to_user: str = Field(description="Relation of the person to the user if obvious from the text")
    short_summary: str = ShortSumaryField
    tags: List[str] = TagsField

    @property
    def table_name(self): return "people"

    def to_supabase_dict(self):
        return {
            "gender": self.gender,
            "name_or_nickname": self.name_or_nickname,
            "short_summary": self.short_summary,
            "occupation": self.occupation,
            "relation_to_user": self.relation_to_user,
            "short_summary": self.short_summary,
            "tags": self.tags
        }

Entity = Union[Bookmark, CodeSnippet, Event, Todo, Note, Person]

ENTITY_TYPES_MAP = dict(
    bookmark=Bookmark,
    code_snippet=CodeSnippet,
    event=Event,
    todo=Todo,
    note=Note,
    person=Person
)

