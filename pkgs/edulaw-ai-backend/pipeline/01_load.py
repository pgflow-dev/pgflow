from typing import List

from langchain_core.document_loaders import BaseLoader
from langchain_core.documents import Document
from lex_parser.db import (ArticleDecorator, LexDb, ParagraphDecorator,
                           PointDecorator)
from tqdm import tqdm

InputModel = ArticleDecorator | ParagraphDecorator | PointDecorator

class LexParserInContextLoader(BaseLoader):
    def __init__(self, path: str):
        self.path = path

    def load(self) -> List[Document]:
        db = LexDb.from_file(self.path)
        # records: List[InputModel] = [*db.articles, *db.paragraphs, *db.points]
        records: List[InputModel] = [*db.points]
        output = [_build_document(record) for record in records]

        return output

def _build_content(record: InputModel) -> str:
    records = [*record.ancestors, record, *record.children]
    texts = [r.text for r in records]

    return "\n".join(texts)

def _build_document(record: InputModel):
    record_dict = record.dict()
    record_dict.pop('text', None)
    record_dict['kind'] = record.__class__.__name__.replace('Decorator', '')

    content = _build_content(record)

    return Document(
        page_content=content,
        metadata=record_dict
    )

if __name__ == "__main__":
    loader = LexParserInContextLoader('data/educational-law-2024.txt')
    docs = loader.load()

    from jsonlines import open as jsonl_open

    with tqdm(total=len(docs), desc="Loading", unit="document") as pbar:
        with jsonl_open('data/pipeline_01.jsonl', 'w') as file:
            for doc in docs:
                file.write(dict(
                    page_content=doc.page_content,
                    metadata=doc.metadata
                ))
                pbar.update(1)

