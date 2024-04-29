from typing import Dict, List, Union

from dotenv import load_dotenv
from jsonlines import open as jsonl_open
from lex_parser.db import (ArticleDecorator, ChapterDecorator, LexDb,
                           ParagraphDecorator, PointDecorator)
from lex_parser.summarize_with_children import create_summarize_with_children

LexModel = Union[ChapterDecorator, ArticleDecorator, ParagraphDecorator, PointDecorator]

from rich.pretty import pprint
from tqdm import tqdm


def generate_and_save_summaries(collection: list, label: str, metadata: Dict):
    summarize_with_children = create_summarize_with_children()

    with jsonl_open(f'data/summaries-{label}.jsonl', mode='w') as file:
        with tqdm(total=len(collection), desc="Generating summaries", unit="record") as pbar:
            for index, output in summarize_with_children.batch_as_completed(collection):
                object = dict(
                    record=output['record'].dict(),
                    summaries=output['summaries'],
                    metadata={**metadata, "label": label},
                )
                file.write(object)
                pbar.update(1)

if __name__ == "__main__":
    load_dotenv()
    db = LexDb.from_file('data/educational-law-2024.txt')

    generate_and_save_summaries(collection=db.articles, label='articles', metadata=dict())
    generate_and_save_summaries(collection=db.paragraphs, label='paragraphs', metadata=dict())
    generate_and_save_summaries(collection=db.points, label='points', metadata=dict())
