import os
from typing import Union

from app.prefixed_embeddings import PrefixedEmbeddings
from dotenv import load_dotenv
from fastapi import Request
from langchain_community.vectorstores.supabase import SupabaseVectorStore
from supabase.client import Client, create_client


def init_supabase_client(auth_token: Union[str, None] = None) -> Client:
    load_dotenv()

    client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY'])

    if auth_token:
        client.auth.set_session(access_token=auth_token, refresh_token='')

    return client

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

def authorize_superadmin(request: Request):
    auth_token_header = request.headers.get("Authorization")

    if not auth_token_header or not auth_token_header.startswith("Bearer "):
        return (False, "Authorization header is missing or invalid")

    # Remove "Bearer " prefix
    auth_token = auth_token_header[7:]

    supabase = init_supabase_client(auth_token)
    response = supabase.rpc('is_superadmin', {}).execute()

    if response.data and response.data == True:
        return (True, "User is superadmin")
    else:
        return (False, "User is NOT superadmin")
