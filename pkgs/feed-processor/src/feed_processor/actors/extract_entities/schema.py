from datetime import datetime
from typing import List, Optional, Union

from pydantic import BaseModel, Field

ReasonField = Field(..., description="Reason you think this entity should be extracted")
ShortSumaryField = Field(..., description="The short and vague overview/outline of the entity, only few words")
TagsField = Field(..., description="List of tags associated with the entity")

class Bookmark(BaseModel):
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

Entity = Union[Bookmark, CodeSnippet, Event, Todo, Note]

class Schema(BaseModel):
    entities: List[Entity] = Field(..., description="List of extracted entities")
