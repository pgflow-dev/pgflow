import os
from typing import Union

from app.prefixed_embeddings import PrefixedEmbeddings
from dotenv import load_dotenv
from langchain_community.vectorstores.supabase import SupabaseVectorStore
from supabase.client import Client, ClientOptions, create_client


def init_supabase_client(auth_token: Union[str, None] = None) -> Client:
    load_dotenv()

    if auth_token:
        options = ClientOptions(
            headers={'Authorization': f"Bearer {auth_token}"}
        )
        return create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY'], options)

    return create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY'])


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
