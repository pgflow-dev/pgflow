
from app.embeddings import embeddings as hf_embeddings
from langchain_core.embeddings import Embeddings
from typing import List

class PrefixedEmbeddings(Embeddings):
    """Uses HuggingfaceEmbeddings to embed documents, but adds model-specific prefixes"""

    def __init__(self, query_prefix: str = "query: ", content_prefix: str = "passage: "):
        self.query_prefix = query_prefix
        self.content_prefix = content_prefix

    def embed_query(self, text: str):
        return hf_embeddings.embed_query(self.query_prefix + text)

    def embed_documents(self, texts: List[str]):
        prefixed_texts = [f"{self.content_prefix}{text}" for text in texts]

        return hf_embeddings.embed_documents(prefixed_texts)

