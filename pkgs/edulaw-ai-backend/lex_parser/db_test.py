import unittest

from lex_parser.db import (ArticleDecorator, ChapterDecorator, LexDb,
                           ParagraphDecorator, PointDecorator)
from lex_parser.models import *
from lex_parser.parser import Parser
from rich.pretty import pprint

parser = Parser()
# with open(f'lex_parser/fixtures/simplified_lex.txt', 'r') as file:
with open(f'data/educational-law-2024.txt', 'r') as file:
    parser.parse(file)

class LexDbTest(unittest.TestCase):
    def test_invariants(self):
        db = LexDb.from_parser(parser)

        for chapter in db.chapters:
            for article in chapter.articles:
                self.assertIsInstance(article, ArticleDecorator)
                self.assertEqual(chapter, article.parent)
                self.assertEqual(chapter, article.chapter)

        for article in db.articles:
            for paragraph in article.paragraphs:
                self.assertIsInstance(paragraph, ParagraphDecorator)
                self.assertEqual(article.chapter, paragraph.chapter)
                self.assertEqual(article, paragraph.parent)

        for paragraph in db.paragraphs:
            if paragraph.article_no:
                self.assertEqual(paragraph.article, paragraph.parent)
            else:
                self.assertEqual(paragraph.chapter, paragraph.parent)

        for point in db.points:
            if point.paragraph_no:
                self.assertIsInstance(point.parent, ParagraphDecorator)
            else:
                self.assertIsInstance(point.parent, ArticleDecorator)

        for subpoint in db.subpoints:
            self.assertIsInstance(subpoint.parent, PointDecorator)
