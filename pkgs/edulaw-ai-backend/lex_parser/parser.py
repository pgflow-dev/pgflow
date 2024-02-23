from typing import List, Optional, TextIO

from lex_parser.models import *
from rich.pretty import pprint


class Parser:
    def __init__(self):
        self.chapters: List[Chapter] = []
        self.articles: List[Article] = []
        self.paragraphs: List[Paragraph] = []
        self.points: List[Point] = []
        self.subpoints: List[Subpoint] = []
        self.current_chapter: Optional[Chapter] = None
        self.current_article: Optional[Article] = None
        self.current_paragraph: Optional[Paragraph] = None
        self.current_point: Optional[Point] = None
        self.current_subpoint: Optional[Subpoint] = None

    def parse(self, file: TextIO):
        print(f"Started parsing {file}")

        for line in file:
            if line.isspace():
                continue
            self.process_line(line.strip())

        print(f"Finished parsing {file}")

    def process_line(self, line: str):
        if Matchers.chapter.match(line):
            self.start_new_chapter(line)
        elif Matchers.article.match(line):
            self.start_new_article(line)
        elif Matchers.paragraph.match(line):
            self.start_new_paragraph(line)
        elif Matchers.point.match(line):
            self.start_new_point(line)
        elif Matchers.subpoint.match(line):
            self.start_new_subpoint(line)
        else:
            self.append_text(line)

    def start_new_chapter(self, line: str):
        match = Matchers.chapter.match(line)
        if match:
            chapter_no = match.group(1)
            self.current_chapter = Chapter(chapter_no=chapter_no)
            self.chapters.append(self.current_chapter)
        else:
            raise Exception(f"Invalid chapter line: {line}")

        # Reset lower hierarchy elements
        self.current_article = None
        self.current_paragraph = None
        self.current_point = None
        self.current_subpoint = None

    def start_new_article(self, line: str):
        match = Matchers.article.match(line)
        if match:
            assert self.current_chapter

            article_no = match.group(1)

            title_match = Matchers.article_title.match(line)
            if title_match:
                article_text = title_match.group(2)
            else:
                article_text = ''

            self.current_article = Article(
                article_no=article_no,
                text=article_text,
                chapter_no=self.current_chapter.chapter_no
            )
            self.articles.append(self.current_article)
        else:
            raise Exception(f"Invalid article line: {line}")

        # Reset lower hierarchy elements
        self.current_paragraph = None
        self.current_point = None
        self.current_subpoint = None

        # some paragraphs are directly specified on the same line than article
        if Matchers.paragraph.match(line):
            self.start_new_paragraph(line)

    def start_new_paragraph(self, line: str):
        match = Matchers.paragraph.match(line)
        if match:
            assert self.current_chapter
            chapter_no = self.current_chapter.chapter_no

            paragraph_no = match.group(3)
            text = match.group(4)

            if self.current_article:
                article_no = self.current_article.article_no
            elif self.current_chapter:
                article_no = ''
            else:
                raise ValueError('No article or chapter found')

            self.current_paragraph = Paragraph(
                paragraph_no=paragraph_no,
                chapter_no=chapter_no,
                article_no=article_no,
                text=text
            )
            self.paragraphs.append(self.current_paragraph)

            # Reset lower hierarchy elements
            self.current_point = None
            self.current_subpoint = None

    def start_new_point(self, line: str):
        match = Matchers.point.match(line)

        if match:
            assert self.current_chapter
            chapter_no = self.current_chapter.chapter_no

            point_no = match.group(1)
            text = match.group(2)
            paragraph_no = ''
            article_no = ''

            if self.current_paragraph:
                paragraph_no = self.current_paragraph.paragraph_no
            if self.current_article:
                article_no = self.current_article.article_no

            self.current_point = Point(
                point_no=point_no,
                chapter_no=chapter_no,
                article_no=article_no,
                paragraph_no=paragraph_no,
                text=text
            )
            self.points.append(self.current_point)

        # Reset lower hierarchy elements
        self.current_subpoint = None

    def start_new_subpoint(self, line: str):
        match = Matchers.subpoint.match(line)
        if match and self.current_point:
            assert self.current_chapter
            assert self.current_article
            assert self.current_point

            subpoint_no = match.group(1)

            # paragraphs are optional, points can be attached to articles directly
            paragraph_no = ''
            if self.current_paragraph:
                paragraph_no = self.current_paragraph.paragraph_no

            text = match.group(2)

            self.current_subpoint = Subpoint(
                subpoint_no=subpoint_no,
                chapter_no=self.current_chapter.chapter_no,
                article_no=self.current_article.article_no,
                paragraph_no=paragraph_no,
                point_no=self.current_point.point_no,
                text=text
            )
            self.subpoints.append(self.current_subpoint)

    def append_text(self, line: str):
        if self.current_subpoint:
            self.current_subpoint.text += f' {line}'
        elif self.current_point:
            self.current_point.text += f' {line}'
        elif self.current_paragraph:
            self.current_paragraph.text += f' {line}'
        elif self.current_article:
            self.current_article.set_text(line)
        elif self.current_chapter:
            self.current_chapter.set_text(line)

if __name__ == '__main__':
    from rich.pretty import pprint

    parser = Parser()

    with open('data/educational-law-2024.txt', 'r') as file:
        parser.parse(file)

    pprint(parser.chapters[0])
    pprint(parser.articles[0])
    pprint(parser.paragraphs[0])
    pprint(parser.points[0])
    pprint(parser.subpoints[0])

    print(f"Chapters: {len(parser.chapters)}")
    print(f"Articles: {len(parser.articles)}")
    print(f"Paragraphs: {len(parser.paragraphs)}")
    print(f"Points: {len(parser.points)}")
    print(f"Subpoints: {len(parser.subpoints)}")

    print()
    print()
    print()
    chapter = [chapter for chapter in parser.chapters if chapter.chapter_no == '6'][0]
    pprint(chapter)
    articles = [article for article in parser.articles if article.chapter_no == chapter.chapter_no]
    pprint(articles)

    filter(lambda article: article.text == '', articles)

    # empty_arts = [article for article in articles if article.text == '']
    # empty_arts_nos = [article.article_no for article in empty_arts]

    # # paragrapsh that correspond to empty_arts
    # paragraphs = [paragraph for paragraph in parser.paragraphs if paragraph.article_no in empty_arts_nos and paragraph.article_no == '1']
    # pprint(paragraphs)


