import os
from dotenv import load_dotenv
load_dotenv()

from langchain_community.vectorstores.supabase import SupabaseVectorStore
from supabase.client import Client, create_client
from app.prefixed_embeddings import PrefixedEmbeddings
from lex_parser.lex_parser_loader import LexParserLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=200,
    chunk_overlap=30,
    separators=[';'],
    keep_separator=True
)
supabase: Client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY'])
loader = LexParserLoader(path='data/educational-law-2024.txt')

if __name__ == '__main__':
    docs = loader.load_and_split(splitter)

    store = SupabaseVectorStore.from_documents(
        documents=docs,
        embedding=PrefixedEmbeddings(),
        client=supabase,
        table_name='documents',
        query_name='match_documents'
    )
