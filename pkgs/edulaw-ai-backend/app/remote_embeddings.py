from app.prefixed_embeddings import PrefixedEmbeddings
from langchain_core.runnables import RunnableLambda

_embeddings = PrefixedEmbeddings()

embed_query = RunnableLambda(_embeddings.embed_query)
embed_documents = RunnableLambda(_embeddings.embed_documents)
