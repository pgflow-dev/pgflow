import os

from app.prefixed_embeddings import PrefixedEmbeddings
from langchain_community.vectorstores.supabase import SupabaseVectorStore
from supabase.client import Client, create_client


def init_supabase_client(supabase_url=os.environ['SUPABASE_URL'], supabase_key=os.environ['SUPABASE_KEY']) -> Client:
    return create_client(supabase_url, supabase_key)

def init_supabase_vectorstore(
        supabase: Client = init_supabase_client(),
        embedding: PrefixedEmbeddings = PrefixedEmbeddings(),
        table_name: str ='documents',
        query_name: str = 'match_documents'
    ) -> SupabaseVectorStore:

    return SupabaseVectorStore(
        embedding=embedding,
        client=supabase,
        table_name=table_name,
        query_name=query_name,
    )
