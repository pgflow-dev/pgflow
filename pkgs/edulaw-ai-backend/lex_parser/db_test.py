import unittest

from lex_parser.db import ArticleDecorator, ChapterDecorator, LexDb
from lex_parser.models import *
from lex_parser.parser import Parser
from rich.pretty import pprint

parser = Parser()
with open(f'lex_parser/fixtures/simplified_lex.txt', 'r') as file:
    parser.parse(file)

class LexDbTest(unittest.TestCase):
    def setUp(self):
        self.db = LexDb.from_parser(parser)

    # def test_chapters(self):
    #     chapter = parser.chapters[0]
    #     decorated = self.db.chapters[0]
    #
    #     self.assertIsInstance(decorated, ChapterDecorator)
    #
    #     self.assertEqual(chapter.chapter_no, decorated.chapter_no)
    #     self.assertEqual(chapter.text, decorated.text)
    #
    #     self.assertIsInstance(decorated.articles[0], ArticleDecorator)
    #
    # def test_articles(self):
    #     article = parser.articles[0]
    #     decorated = self.db.articles[0]
    #
    #     self.assertIsInstance(decorated, ArticleDecorator)
    #
    #     self.assertEqual(article.chapter, self.db.chapters[0])
    #     self.assertEqual(article.article_no, decorated.article_no)
    #     self.assertEqual(article.text, decorated.text)
    #
    #     self.assertIsInstance(decorated.chapter, ChapterDecorator)
    #     self.assertIsInstance(decorated.paragraphs[0], Paragraph)
