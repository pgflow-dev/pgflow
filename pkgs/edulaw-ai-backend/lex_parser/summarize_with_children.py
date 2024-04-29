from operator import itemgetter
from typing import Union

from dotenv import load_dotenv
from langchain_core.runnables import RunnableLambda, RunnablePassthrough
from lex_parser.db import (ArticleDecorator, ChapterDecorator, LexDb,
                           ParagraphDecorator, PointDecorator)
from lex_parser.summarize_chain import create_chain as create_summarize_chain

LexModel = Union[ChapterDecorator, ArticleDecorator, ParagraphDecorator, PointDecorator]

def create_summarize_with_children():
    summarize = create_summarize_chain()

    def build_text(record: LexModel) -> str:
        texts = [record.text, *(child.text for child in record.children)]

        # insert record.parent.text at the beginning of texts if record.parent is not none
        # do not overwrite any existing items, just shift them
        if hasattr(record, 'parent') and record.parent:
            texts.insert(0, record.parent.text)

        return "\n".join(texts)

    return (
        {"text": RunnableLambda(build_text), "record": RunnablePassthrough()}
            | RunnablePassthrough.assign(summaries=summarize)
    )


if __name__ == "__main__":
    load_dotenv()
    from rich.pretty import pprint

    db = LexDb.from_file('data/educational-law-2024.txt')

    summarize_with_children = create_summarize_with_children()

    record = db.points_by(article_no='4', point_no='32')[0]

    summaries = summarize_with_children.invoke(record)

    pprint(summaries)
