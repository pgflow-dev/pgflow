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
    def article(self):
        try:
            return self._db.articles_by(article_no=self.article_no)[0]
        except IndexError:
            return None

    @property
    def articles(self):
        return self._db.articles_by(article_no=self.article_no)

    # @property
    # def paragraphs(self):
    #     return self._db.paragraphs_by(**self.id)
    #
    # @property
    # def points(self):
    #     return self._db.points_by(**self.id)
    #
    # @property
    # def subpoints(self):
    #     return self._db.subpoints_by(**self.id)
    #
    # @property
    # def paragraph(self):
    #     try:
    #         filter = dict(chapter_no=self.chapter_no)
    #
    #         if self.article_no:
    #             filter['article_no'] = self.article_no
    #
    #         return self._db.paragraphs_by(filter)[0]
    #     except IndexError:
    #         return None
    #
    # @property
    # def point(self):
    #     try:
    #         return self._db.points_by(chapter_no=self.chapter_no)[0]
    #     except IndexError:
    #         return None

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

    @property
    def articles(self):
        return self._db.articles_by(chapter_no=self.chapter_no)

    @property
    def paragraphs(self):
        return self._db.paragraphs_by(chapter_no=self.chapter_no)

class ArticleDecorator(BaseDecorator):
    def __init__(self, model: Article, db: LexDb):
        self._model = model
        self._db = db

    @property
    def parent(self):
        return self.chapter

    @property
    def paragraphs(self):
        return self._db.paragraphs_by(article_no=self.article_no)

    @property
    def points(self):
        return self._db.points_by(article_no=self.article_no)

    @property
    def subpoints(self):
        return self._db.subpoints_by(article_no=self.article_no)

class ParagraphDecorator(BaseDecorator):
    def __init__(self, model: Paragraph, db: LexDb):
        self._model = model
        self._db = db

    @property
    def parent(self):
        # articles are optional, paragraphs can be attached to chapters directly
        if self.article_no:
            return self.article
        else:
            return self.chapter

class PointDecorator(BaseDecorator):
    def __init__(self, model: Point, db: LexDb):
        self._model = model
        self._db = db

    @property
    def parent(self):

        # paragraphs are optional, points can be attached to articles directly
        if self.paragraph_no:
            return self._db.paragraphs_by(
                article_no=self.article_no,
                paragraph_no=self.paragraph_no
            )
        else:
            return self.article

class SubpointDecorator(BaseDecorator):
    def __init__(self, model: Subpoint, db: LexDb):
        self._model = model
        self._db = db

    @property
    def parent(self):
        filter = dict(article_no=self.article_no)

        # paragraphs are optional, points can be attached to articles directly
        if self.paragraph_no:
            filter['paragraph_no'] = self.paragraph_no

        return self._db.points_by(**filter)

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

    def chapters_by(self, **attributes) -> List[ChapterDecorator]:
        return filter_by(self.chapters, attributes)

    def articles_by(self, **attributes) -> List[ArticleDecorator]:
        return filter_by(self.articles, attributes)

    def paragraphs_by(self, **attributes) -> List[ParagraphDecorator]:
        return filter_by(self.paragraphs, attributes)

    def points_by(self, **attributes) -> List[PointDecorator]:
        return filter_by(self.points, attributes)

    def subpoints_by(self, **attributes) -> List[SubpointDecorator]:
        return filter_by(self.subpoints, attributes)

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

    import code; code.interact(local=dict(globals(), **locals()))
    # paragraph = db.find_paragraphs(chapter_no='10', article_no='')
    #
    # pprint(paragraph)
