from langchain.embeddings.huggingface import HuggingFaceEmbeddings

def supabase(docs):
    embed(docs, model_name="Supabase/gte-small")

def embed(docs, model_name):
    print("Loading embeddings...")
    embeddings = HuggingFaceEmbeddings(
        model_name=model_name,
        model_kwargs={'device': 'cuda'},
        encode_kwargs={'normalize_embeddings': True},
    )


    import time
    start = time.time()
    print("Embedding docs...")
    embedded_docs = embeddings.embed_documents(texts=docs)
    end = time.time()

    print(f"Embedding time: {end - start} seconds")

    return embedded_docs

if __name__ == "__main__":
    supabase(["Hello World"])
