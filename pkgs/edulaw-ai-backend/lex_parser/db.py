from typing import ForwardRef, List

from lex_parser.models import *
from lex_parser.parser import Parser


class BaseDecorator:
    def __getattr__(self, name):
        return getattr(self._model, name)


class ChapterDecorator(BaseDecorator):
    def __init__(self, model: Chapter, db: 'LexDb'):
        self._model = model
        self._db = db

class ArticleDecorator(BaseDecorator):
    def __init__(self, model: Article, db: 'LexDb'):
        self._model = model
        self._db = db

    @property
    def chapter(self):
        return self.db.find_chapter(self.chapter_no)

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
    def paragraphs(self) -> List[Paragraph]:
        return self._paragraphs

    @property
    def points(self) -> List[Point]:
        return self._points

    @property
    def subpoints(self) -> List[Subpoint]:
        return self._subpoints

    @classmethod
    def from_parser(cls, parser: Parser):
        return cls(
            chapters=parser.chapters,
            articles=parser.articles,
            paragraphs=parser.paragraphs,
            points=parser.points,
            subpoints=parser.subpoints
        )

    # @property
    # def chapters(self) -> List[ChapterDecorator]:
    #     return [ChapterDecorator(chapter, db=self) for chapter in self._chapters]

if __name__ == '__main__':
    from rich.pretty import pprint

    parser = Parser()
    with open('data/educational-law-2024.txt', 'r') as file:
        parser.parse(file)

    db = LexDb.from_parser(parser)

    # registry.chapters
