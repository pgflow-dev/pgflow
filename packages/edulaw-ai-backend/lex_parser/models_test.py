import unittest
from lex_parser.models import Matchers
import re
from rich.pretty import pprint

class TestModels(unittest.TestCase):
    def test_chapter_matcher(self):
        self.assertRegex('Rozdział 1', Matchers.chapter)
        self.assertRegex('Rozdział 26a', Matchers.chapter)
        self.assertNotRegex('\nRozdział 26a', Matchers.chapter, "Line should start with Rodział")
        self.assertNotRegex('\nRozdział X', Matchers.chapter, "Chapter number must be a number")

        matched = re.match(Matchers.chapter, "Rozdział 17.\n")
        assert matched
        self.assertEqual("17", matched.group(1))

    def test_article_matcher(self):
        self.assertRegex('Art. 1.', Matchers.article)
        self.assertRegex("Art. 2. 1. System oświaty wspierają:", Matchers.article)
        self.assertNotRegex('Art. X.', Matchers.article, "Article number must be a number")
        self.assertNotRegex('\nArt. 1.', Matchers.article, "Line should start with Art.")

        matched = re.match(Matchers.article, "Art. 73. Article Title")
        assert matched
        self.assertEqual("73", matched.group(1))

        matched = re.match(Matchers.article, "Art. 2. 1. System oświaty wspierają:")
        assert matched
        self.assertEqual("2", matched.group(1))

    def test_article_title_matcher(self):
        self.assertRegex("Art. 1. SomeText", Matchers.article_title, 
                         "Matches Art. line that contains a title")
        self.assertNotRegex("Art. 1. 1. SomeText", Matchers.article_title, 
                            "Does not match Art. line that contains first paragraph")

        matched = re.match(Matchers.article_title, "Art. 73. SomeText")
        assert matched
        self.assertEqual("73", matched.group(1))
        self.assertEqual("SomeText", matched.group(2))
        

    def test_paragraph_matcher_solo(self):
        self.assertRegex('1.', Matchers.paragraph)
        self.assertRegex('7a.', Matchers.paragraph)
        self.assertNotRegex('X.', Matchers.paragraph, "Paragraph number must be a number")
        self.assertNotRegex('\n1.', Matchers.paragraph, "Line should start with number")

        matched = re.match(Matchers.paragraph, "14.")
        assert matched
        self.assertEqual("14", matched.group(3))

        matched = re.match(Matchers.paragraph, "14a.")
        assert matched
        self.assertEqual("14a", matched.group(3))

    def test_paragraph_matcher_from_article(self):
        self.assertRegex('Art. 1. 1.', Matchers.paragraph)
        self.assertRegex('Art. 1. 1a.', Matchers.paragraph)
        self.assertNotRegex('Art. 1. Xa.', Matchers.paragraph, "Paragraph number must be a number")
        self.assertNotRegex('\nArt. 1. 1a.', Matchers.paragraph, "Line should start with number")

        matched = re.match(Matchers.paragraph, "Art. 1. 14. With Text:")
        assert matched
        self.assertEqual("14", matched.group(3))
        self.assertEqual("With Text:", matched.group(4))

        matched = re.match(Matchers.paragraph, "Art. 1. 14a. With Text:")
        assert matched
        self.assertEqual("14a", matched.group(3))
        self.assertEqual("With Text:", matched.group(4))


    def test_point_matcher(self):
        self.assertRegex('1) point text', Matchers.point)
        self.assertRegex('1a) point text', Matchers.point)
        self.assertNotRegex('X) some text', Matchers.point, "Point number must be a number followed by optional letter")
        self.assertNotRegex('\n1) other text', Matchers.point, "Line should start with number")

        matched = re.match(Matchers.point, "14) Some Text")
        assert matched
        self.assertEqual("14", matched.group(1))
        self.assertEqual("Some Text", matched.group(2))

        matched = re.match(Matchers.point, "14a) Some Text")
        assert matched
        self.assertEqual("14a", matched.group(1))
        self.assertEqual("Some Text", matched.group(2))

    def test_subpoint_matcher(self):
        self.assertRegex('a) subpoint text', Matchers.subpoint)
        self.assertNotRegex('1) other text', Matchers.subpoint, "Subpoint is not a point")
        self.assertNotRegex('\na) anything', Matchers.subpoint, "Line should start with letter")

        matched = re.match(Matchers.subpoint, "g) subpoint text")
        assert matched
        self.assertEqual("g", matched.group(1))
        self.assertEqual("subpoint text", matched.group(2))



if __name__ == '__main__':
    unittest.main()

