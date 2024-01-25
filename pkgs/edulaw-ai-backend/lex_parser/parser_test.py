from lex_parser.parser import Parser
from lex_parser.models import *
import unittest
from rich.pretty import pprint

class ParserTest(unittest.TestCase):
    def setUp(self):
        self.parser = Parser()

        with open(f'lex_parser/fixtures/simplified_lex.txt', 'r') as file:
            self.parser.parse(file)

    def test_chapters(self):
        chapters = self.parser.chapters
        self.assertEqual(2, len(chapters))

        self.assertEqual("1", chapters[0].chapter_no)
        self.assertEqual("Przepisy ogólne", chapters[0].text)

        self.assertEqual("2", chapters[1].chapter_no)
        self.assertEqual("Bardziej szczegółowe przepisy", chapters[1].text)

    def test_articles(self):
        articles = self.parser.articles

        self.assertEqual(4, len(articles))

        article = articles[0]
        self.assertEqual("1", article.article_no)
        self.assertEqual("1", article.chapter_no)
        self.assertEqual("System oświaty zapewnia w szczególności:", article.text)

        article = articles[1]
        self.assertEqual("2", article.article_no)
        self.assertEqual("1", article.chapter_no)
        self.assertEqual("", article.text, "This article is title-less and starts with a paragraph")

        article = articles[2]
        self.assertEqual("3", article.article_no)
        self.assertEqual("1", article.chapter_no)
        self.assertEqual("Ilekroć w dalszych przepisach jest mowa bez bliższego określenia o:", article.text)

        article = articles[3]
        self.assertEqual("1", article.article_no)
        self.assertEqual("2", article.chapter_no)
        self.assertEqual("Szczegóły na temat systemu oświaty to:", article.text)

    def test_paragraphs(self):
        paragraphs = self.parser.paragraphs
        self.assertEqual(5, len(paragraphs))

        paragraph = paragraphs[0]
        self.assertEqual("1", paragraph.paragraph_no)
        self.assertEqual("1", paragraph.chapter_no)
        self.assertEqual("2", paragraph.article_no)
        self.assertEqual("System oświaty wspierają:", paragraph.text)

        paragraph = paragraphs[1]
        self.assertEqual("1a", paragraph.paragraph_no)
        self.assertEqual("1", paragraph.chapter_no)
        self.assertEqual("2", paragraph.article_no)
        self.assertEqual("System oświaty w zakresie kształcenia zawodowego", paragraph.text)

        paragraph = paragraphs[2]
        self.assertEqual("2", paragraph.paragraph_no)
        self.assertEqual("1", paragraph.chapter_no)
        self.assertEqual("2", paragraph.article_no)
        self.assertEqual("Organy administracji publicznej, w tym organy prowadzące szkoły i placówki", paragraph.text)

        paragraph = paragraphs[3]
        self.assertEqual("3", paragraph.paragraph_no)
        self.assertEqual("1", paragraph.chapter_no)
        self.assertEqual("2", paragraph.article_no)
        self.assertEqual("System oświaty mogą wspierać także jednostki organizacyjne", paragraph.text)

        paragraph = paragraphs[4]
        self.assertEqual("4", paragraph.paragraph_no)
        self.assertEqual("1", paragraph.chapter_no)
        self.assertEqual("2", paragraph.article_no)
        self.assertEqual("Organy administracji publicznej, w tym organy prowadzące", paragraph.text)

    def test_points(self):
        points = self.parser.points
        self.assertEqual(11, len(points))

        # Chapter 1

        point = points[0]
        self.assertEqual("1", point.point_no)
        self.assertEqual("1", point.chapter_no)
        self.assertEqual("1", point.article_no)
        self.assertEqual('realizację prawa każdego obywatela Rzeczypospolitej Polskiej;', point.text)

        point = points[1]
        self.assertEqual("2", point.point_no)
        self.assertEqual("1", point.chapter_no)
        self.assertEqual("1", point.article_no)
        self.assertEqual("wspomaganie przez szkołę wychowawczej roli rodziny;", point.text)

        point = points[2]
        self.assertEqual("1", point.point_no)
        self.assertEqual("1", point.chapter_no)
        self.assertEqual("2", point.article_no)
        self.assertEqual("organizacje pozarządowe, w tym organizacje harcerskie;", point.text)

        point = points[3]
        self.assertEqual("2", point.point_no)
        self.assertEqual("1", point.chapter_no)
        self.assertEqual("2", point.article_no)
        self.assertEqual("instytuty badawcze;", point.text)

        point = points[4]
        self.assertEqual("2a", point.point_no)
        self.assertEqual("1", point.chapter_no)
        self.assertEqual("2", point.article_no)
        self.assertEqual("punkt z literka", point.text)

        point = points[5]
        self.assertEqual("1", point.point_no)
        self.assertEqual("1", point.chapter_no)
        self.assertEqual("3", point.article_no)
        self.assertEqual("szkole - należy przez to rozumieć także przedszkole;", point.text)

        point = points[6]
        self.assertEqual("2", point.point_no)
        self.assertEqual("1", point.chapter_no)
        self.assertEqual("3", point.article_no)
        self.assertEqual("szkole specjalnej lub oddziale specjalnym - należy przez to rozumieć odpowiednio:", point.text)

        point = points[7]
        self.assertEqual("2a", point.point_no)
        self.assertEqual("1", point.chapter_no)
        self.assertEqual("3", point.article_no)
        self.assertEqual("inny punkt z literka", point.text)

        point = points[8]
        self.assertEqual("2b", point.point_no)
        self.assertEqual("1", point.chapter_no)
        self.assertEqual("3", point.article_no)
        self.assertEqual("nastepny punkt z literka", point.text)

        # Chapter 2

        point = points[9]
        self.assertEqual("1", point.point_no)
        self.assertEqual("2", point.chapter_no)
        self.assertEqual("1", point.article_no)
        self.assertEqual("realizację prawa każdego obywatela Rzeczypospolitej Polskiej do kształcenia się", point.text)

        point = points[10]
        self.assertEqual("2", point.point_no)
        self.assertEqual("2", point.chapter_no)
        self.assertEqual("1", point.article_no)
        self.assertEqual("wspomaganie przez szkołę wychowawczej roli rodziny;", point.text)

    def test_subpoints(self):
        subpoints = self.parser.subpoints
        self.assertEqual(4, len(subpoints))

        subpoint = subpoints[0]
        self.assertEqual("a", subpoint.subpoint_no)
        self.assertEqual("1", subpoint.chapter_no)
        self.assertEqual("2", subpoint.article_no)
        self.assertEqual("1", subpoint.paragraph_no)
        self.assertEqual("2", subpoint.point_no)
        self.assertEqual("oraz inne inicjatywy", subpoint.text)

        subpoint = subpoints[1]
        self.assertEqual("b", subpoint.subpoint_no)
        self.assertEqual("1", subpoint.chapter_no)
        self.assertEqual("2", subpoint.article_no)
        self.assertEqual("1", subpoint.paragraph_no)
        self.assertEqual("2", subpoint.point_no)
        self.assertEqual("tutaj nie wyszególnione", subpoint.text)

        subpoint = subpoints[2]
        self.assertEqual("a", subpoint.subpoint_no)
        self.assertEqual("1", subpoint.chapter_no)
        self.assertEqual("3", subpoint.article_no)
        self.assertEqual("", subpoint.paragraph_no)
        self.assertEqual("2", subpoint.point_no)
        self.assertEqual("szkołę lub oddział dla uczniów posiadających orzeczenie", subpoint.text)


        subpoint = subpoints[3]
        self.assertEqual("b", subpoint.subpoint_no)
        self.assertEqual("1", subpoint.chapter_no)
        self.assertEqual("3", subpoint.article_no)
        self.assertEqual("", subpoint.paragraph_no)
        self.assertEqual("2", subpoint.point_no)
        self.assertEqual("szkołę lub oddział zorganizowane w podmiocie leczniczym", subpoint.text)


if __name__ == '__main__':
    unittest.main()
