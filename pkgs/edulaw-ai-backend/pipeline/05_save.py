from dotenv import load_dotenv

load_dotenv()

import os
import uuid

from app.prefixed_embeddings import PrefixedEmbeddings
from jsonlines import open as jsonl_open
from langchain_community.vectorstores.supabase import SupabaseVectorStore
from supabase.client import Client, create_client

if __name__ == "__main__":
    docs_to_batch = list()
    with jsonl_open('data/pipeline_04.jsonl', 'r') as reader:
        docs_to_batch = list(reader)

    embeddings = PrefixedEmbeddings()
    langchain_docs = []
    supabase: Client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY'])
    store = SupabaseVectorStore.from_documents(
        documents=langchain_docs,
        embedding=embeddings,
        client=supabase,
        table_name='embeddings',
        query_name='match_documents_via_embeddingns'
    )

    for record in docs_to_batch:
        document_id = str(uuid.uuid4())
        content = record['doc']['page_content']
        metadata = record['doc']['metadata']
        content_embedding = record['content_embedding']

        result = supabase.table('documents').insert(dict(
            id=document_id,
            content=content,
            metadata=metadata,
            embedding=content_embedding
        )).execute()

        document = result.data[0]

        embedded_questions = [
            dict(
                id=str(uuid.uuid4()),
                document_id = document_id,
                embedding=embeddings.embed_documents([question])[0],
                type="summary"
            )
            for question in record['questions']
        ]
        result = supabase.table('embeddings').insert(embedded_questions).execute()
