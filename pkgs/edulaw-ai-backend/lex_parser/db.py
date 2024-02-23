from __future__ import annotations

from typing import List, TypeVar

from lex_parser.models import *
from lex_parser.parser import Parser

T = TypeVar('T', bound='BaseDecorator')

class BaseDecorator:
    def __getattr__(self, name):
        return getattr(self._model, name)

    @property
    def chapter(self):
        try:
            return self._db.chapters_by(chapter_no=self.chapter_no)[0]
        except IndexError:
            return None

    @property
    def articles(self):
        return self._db.articles_by(**self.id)

    @property
    def points(self):
        return self._db.points_by(**self.id)

    @property
    def paragraphs(self):
        return self._db.paragraphs_by(**self.id)

    @property
    def paragraph(self):
        return self.db.find_paragraph(self.paragraph_no)

    @property
    def article(self):
        return self.db.find_article(self.article_no)

    @property
    def point(self):
        return self.db.find_point(self.point_no)

def matches_filter(model: BaseDecorator, filter: dict[str, str]) -> bool:
    for key, value in filter.items():
        if getattr(model, key) != value:
            return False
    return True

def filter_by(models: List[T], filter: dict[str, str]) -> List[T]:
    return [model for model in models if matches_filter(model, filter)]

class ChapterDecorator(BaseDecorator):
    def __init__(self, model: Chapter, db: LexDb):
        self._model = model
        self._db = db

class ArticleDecorator(BaseDecorator):
    def __init__(self, model: Article, db: LexDb):
        self._model = model
        self._db = db

class ParagraphDecorator(BaseDecorator):
    def __init__(self, model: Paragraph, db: LexDb):
        self._model = model
        self._db = db

class PointDecorator(BaseDecorator):
    def __init__(self, model: Point, db: LexDb):
        self._model = model
        self._db = db

class SubpointDecorator(BaseDecorator):
    def __init__(self, model: Subpoint, db: LexDb):
        self._model = model
        self._db = db

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

    def chapters_by(self, **filter) -> List[ChapterDecorator]:
        return filter_by(self.chapters, **filter)

    def articles_by(self, **filter) -> List[ArticleDecorator]:
        return filter_by(self.articles, **filter)

    def paragraphs_by(self, **filter) -> List[ParagraphDecorator]:
        return filter_by(self.paragraphs, **filter)

    def points_by(self, **filter) -> List[PointDecorator]:
        return filter_by(self.points, **filter)

    def subpoints_by(self, **filter) -> List[SubpointDecorator]:
        return filter_by(self.subpoints, **filter)

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

    # db = LexDb.from_parser(parser)
    # paragraph = db.find_paragraphs(chapter_no='10', article_no='')
    #
    # pprint(paragraph)
