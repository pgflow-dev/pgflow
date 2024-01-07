from langchain.embeddings.huggingface import HuggingFaceEmbeddings

if __name__ == "__main__":
    print("Loading embeddings...")
    embeddings = HuggingFaceEmbeddings(
        model_name="Supabase/gte-small",
        model_name="sentence-transformers/all-mpnet-base-v2",
        model_kwargs={'device': 'cuda'},
        encode_kwargs={'normalize_embeddings': True},
    )

    docs = ["Hello World"]
    print("Embedding docs...")

    import time
    start = time.time()
    embedded_docs = embeddings.embed_documents(texts=docs)
    end = time.time()

    print(embedded_docs)
    print(f"Embedding time: {end - start} seconds")
