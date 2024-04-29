
from typing import Dict, List, Union

from dotenv import load_dotenv
from jsonlines import open as jsonl_open
from lex_parser.db import (ArticleDecorator, ChapterDecorator, LexDb,
                           ParagraphDecorator, PointDecorator)
from lex_parser.summarize_with_children import create_summarize_with_children

LexModel = Union[ChapterDecorator, ArticleDecorator, ParagraphDecorator, PointDecorator]

from app.prefixed_embeddings import PrefixedEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from rich.pretty import pprint
from supabase.client import Client, create_client
from tqdm import tqdm


def _metadata_for(model: LexModel, source: str):
    """Creates metadata from LexModel attributes, without text and with added source"""

    metadata = model.dict()
    metadata.pop('text', None)
    metadata['source'] = source
    metadata['kind'] = model.__class__.__name__

    return metadata

if __name__ == '__main__':
    import os

    from dotenv import load_dotenv
    load_dotenv()

    import uuid



    supabase: Client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY'])
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=200,
        chunk_overlap=30,
        separators=[';'],
        keep_separator=False
    )

    summarize_with_children = create_summarize_with_children()

    db = LexDb.from_file('data/educational-law-2024.txt')
    collection = db.paragraphs
    collection = [collection[17]]

    embeddings = PrefixedEmbeddings()

    with tqdm(total=len(collection), desc="Importing...", unit="record") as pbar:
        for index, output in summarize_with_children.batch_as_completed(collection):
            text = output['text']
            record = output['record']
            summaries = output['summaries']
            pprint(summaries)
            metadata = _metadata_for(record, source='paragraph-in-context')

            doc_embedding = embeddings.embed_documents([text])[0]

            result = supabase.table('documents').insert(dict(
                id=str(uuid.uuid4()),
                content=text,
                metadata=metadata,
                embedding=doc_embedding
            )).execute()

            document = result.data[0]

            embedded_summaries = [dict(
                id=str(uuid.uuid4()),
                document_id = document['id'],
                embedding=embeddings.embed_documents([summary])[0],
                type="summary"
            ) for summary in summaries]
            result = supabase.table('embeddings').insert(embedded_summaries).execute()

            pbar.update(1)
