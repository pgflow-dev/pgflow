from __future__ import annotations

from typing import List

from lex_parser.models import *
from lex_parser.parser import Parser


class BaseDecorator:
    def __getattr__(self, name):
        return getattr(self._model, name)


class ChapterDecorator(BaseDecorator):
    def __init__(self, model: Chapter, db: LexDb):
        self._model = model
        self._db = db

class ArticleDecorator(BaseDecorator):
    def __init__(self, model: Article, db: LexDb):
        self._model = model
        self._db = db

    @property
    def chapter(self):
        return self.db.find_chapter(self.chapter_no)

class ParagraphDecorator(BaseDecorator):
    def __init__(self, model: Paragraph, db: LexDb):
        self._model = model
        self._db = db

    @property
    def article(self):
        return self.db.find_article(self.article_no)

class PointDecorator(BaseDecorator):
    def __init__(self, model: Point, db: LexDb):
        self._model = model
        self._db = db

    @property
    def paragraph(self):
        return self.db.find_paragraph(self.paragraph_no)

    @property
    def article(self):
        return self.db.find_article(self.article_no)

class SubpointDecorator(BaseDecorator):
    def __init__(self, model: Subpoint, db: LexDb):
        self._model = model
        self._db = db

    @property
    def point(self):
        return self.db.find_point(self.point_no)

class LexDb:
    def __init__(
            self,
            chapters: List[Chapter],
            articles: List[Article],
            paragraphs: List[Paragraph],
            points: List[Point],
            subpoints: List[Subpoint]
        ):

        self._chapters = chapters
        self._articles = articles
        self._paragraphs = paragraphs
        self._points = points
        self._subpoints = subpoints

    @property
    def chapters(self) -> List[ChapterDecorator]:
        return [ChapterDecorator(chapter, db=self) for chapter in self._chapters]

    @property
    def articles(self) -> List[ArticleDecorator]:
        return [ArticleDecorator(article, db=self) for article in self._articles]

    @property
    def paragraphs(self) -> List[ParagraphDecorator]:
        return [ParagraphDecorator(paragraph, db=self) for paragraph in self._paragraphs]

    @property
    def points(self) -> List[PointDecorator]:
        return [PointDecorator(point, db=self) for point in self._points]

    @property
    def subpoints(self) -> List[SubpointDecorator]:
        return [SubpointDecorator(subpoint, db=self) for subpoint in self._subpoints]

    @classmethod
    def from_parser(cls, parser: Parser):
        return cls(
            chapters=parser.chapters,
            articles=parser.articles,
            paragraphs=parser.paragraphs,
            points=parser.points,
            subpoints=parser.subpoints
        )

if __name__ == '__main__':
    from rich.pretty import pprint

    parser = Parser()
    with open('data/educational-law-2024.txt', 'r') as file:
        parser.parse(file)

    db = LexDb.from_parser(parser)
