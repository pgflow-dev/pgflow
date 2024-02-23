import os
from typing import List, Union

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders.base import BaseLoader
from langchain_core.documents import Document
from lex_parser.models import (Article, Chapter, LexModel, Paragraph, Point,
                               Subpoint)
from lex_parser.parser import Parser


class LexParserLoader(BaseLoader):
    def __init__(self, path: str):
        self.path = path

    def load(self):
        models = self._parse()

        source = os.path.basename(self.path)
        return [self._document_from(model=model, source=source) for model in models]

    def _parse(self) -> List[LexModel]:
        parser = Parser()
        parser.parse(open(self.path))

        return [
            *parser.chapters,
            *parser.articles,
            *parser.paragraphs,
            *parser.points,
            *parser.subpoints
        ]

    def _metadata_for(self, model: LexModel, source: str):
        """Creates metadata from LexModel attributes, without text and with added source"""

        metadata = model.dict()
        metadata.pop('text', None)
        metadata['source'] = source
        metadata['kind'] = model.__class__.__name__

        return metadata

    def _document_from(self, model: LexModel, source: str) -> Document:
        """Creates document from LexModel with proper metadata"""

        return Document(
            page_content=model.text,
            metadata=self._metadata_for(model, source=source)
        )



if __name__ == '__main__':
    from rich.pretty import pprint

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=200,
        chunk_overlap=30,
        separators=[';'],
        keep_separator=True
    )

    loader = LexParserLoader(path='data/educational-law-2024.txt')
    chunks = loader.load_and_split(splitter)

    pprint(chunks)
