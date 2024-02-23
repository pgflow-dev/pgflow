import re
from typing import Optional, Union

from pydantic import BaseModel


class Chapter(BaseModel):
    chapter_no: str
    text: str = ''

    @property
    def id(self):
        return dict(chapter_no=self.chapter_no)

    def set_text(self, text: str):
        if self.text == '':
            self.text = text

class Article(BaseModel):
    article_no: str
    chapter_no: str
    text: str = ''

    @property
    def id(self):
        return dict(chapter_no=self.chapter_no, article_no=self.article_no)

    def set_text(self, text: str):
        if self.text == '':
            self.text = text

class Paragraph(BaseModel):
    paragraph_no: str
    chapter_no: str
    article_no: Optional[str]
    text: str = ''  # Initialize with empty string

    @property
    def id(self):
        return dict(
            chapter_no=self.chapter_no,
            article_no=self.article_no,
            paragraph_no=self.paragraph_no
        )

class Point(BaseModel):
    point_no: str
    chapter_no: str
    article_no: Optional[str]
    paragraph_no: Optional[str]
    text: str = ''  # Initialize with empty string

    @property
    def id(self):
        return dict(
            chapter_no=self.chapter_no,
            article_no=self.article_no,
            paragraph_no=self.paragraph_no,
            point_no=self.point_no
        )

class Subpoint(BaseModel):
    subpoint_no: str
    chapter_no: str
    article_no: str
    paragraph_no: str
    point_no: str
    text: str

    @property
    def id(self):
        return dict(
            chapter_no=self.chapter_no,
            article_no=self.article_no,
            paragraph_no=self.paragraph_no,
            point_no=self.point_no,
            subpoint_no=self.subpoint_no
        )

LexModel = Union[Chapter, Article, Paragraph, Point, Subpoint]

# Regex patterns as provided
class Matchers:
    chapter = re.compile(r'^Rozdział (\d+)')
    article = re.compile(r'^Art\. (\d+)\.')
    article_title = re.compile(r'^Art\. (\d+)\.(?!\s?\d+\.)\s*(.*)')
    paragraph = re.compile(r'^(Art\. (\d+)\.\s?)?([0-9]+[a-zA-Z]?)\.\s?(.*)')
    point = re.compile(r'^([0-9]+[a-zA-Z]?)\)\s?(.*)')
    subpoint = re.compile(r'^([a-z])\)\s?(.*)')
