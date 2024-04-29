import os

from dotenv import load_dotenv

load_dotenv()

from app.prefixed_embeddings import PrefixedEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores.supabase import SupabaseVectorStore
from langchain_openai import OpenAIEmbeddings
from lex_parser.lex_parser_loader import LexParserLoader
from supabase.client import Client, create_client

splitter = RecursiveCharacterTextSplitter(
    chunk_size=200,
    chunk_overlap=30,
    separators=[';'],
    keep_separator=False
)
supabase: Client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY'])
loader = LexParserLoader(path='data/educational-law-2024.txt')

if __name__ == '__main__':
    docs = loader.load_and_split(splitter)

    # embeddings = PrefixedEmbeddings()
    embeddings = OpenAIEmbeddings();

    store = SupabaseVectorStore.from_documents(
        documents=docs,
        embedding=embeddings,
        client=supabase,
        table_name='documents',
        query_name='match_documents'
    )
