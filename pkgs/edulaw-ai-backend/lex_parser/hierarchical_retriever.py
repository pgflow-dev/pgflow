from langchain_core.retrievers import BaseRetriever
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from typing import List
from app.prefixed_embeddings import PrefixedEmbeddings
from supabase.client import Client, create_client
from langchain_community.vectorstores.supabase import SupabaseVectorStore
from langchain_core.output_parsers import StrOutputParser
from operator import itemgetter

from langchain_core.runnables import RunnablePassthrough, RunnableParallel



if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv()
    import os
    from rich.pretty import pprint

    embeddings = PrefixedEmbeddings()
    supabase: Client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY'])
    store = SupabaseVectorStore(
        embedding=PrefixedEmbeddings(),
        client=supabase,
        table_name='documents',
        query_name='match_documents',
    )

    paragraph_retriever = store.as_retriever(
        search_kwargs={
            'filter': {'kind': 'Paragraph'},
            'score_threshold': 0.7
        },
        search_type='similarity_score_threshold'
    )

    def retrieve_points(paragraphs: List[Document], question: str):
        embedding = embeddings.embed_query(question)
        params = dict(
            query_embedding=embedding,
            match_threshold=0.70,
            match_count=5
        )
        points = supabase.rpc('match_documents', params=params).execute()

    # chain = (
    #     {"paragraphs": paragraph_retriever, "question": RunnablePassthrough()}
    #         | {"paragraphs": RunnablePassthrough(),
    #            "question": RunnablePassthrough(),
    #            "points": retrieve_points,
    #            "subpoints": retrieve_subpoints }

    # )

    # question = "jakiego wsparcia może udzielić szkoła uczniowi z zespołem aspergera?"
    # pprint(chain.invoke(question))
