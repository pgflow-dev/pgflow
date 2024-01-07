from ai_tools.embed import supabase as embed
from langchain.document_loaders.directory import DirectoryLoader
from langchain.document_loaders.epub import UnstructuredEPubLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from jsonlines import Writer as JsonlWriter

def load_epubs(path_to_epubs):
    print("Initializing loader...")
    loader = DirectoryLoader(
        path_to_epubs,
        glob="**/*.epub",
        loader_cls=UnstructuredEPubLoader,
        show_progress=True
    )

    print("Loading epubs...")
    return loader.load()

def split_docs(docs):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=100,
        chunk_overlap=30,
        length_function=len,
        is_separator_regex=False
    )

    print("Splitting docs...")
    return splitter.create_documents(docs)

def save_output(docs):
    import io
    import datetime

    output_filename = datetime.datetime.now().strftime("%Y-%m-%d-%H-%M-%S.jsonl")
    output_file = io.open(output_filename, "w", encoding="utf8")

    print("Saving output...")
    with JsonlWriter(output_file) as writer:
        for doc in docs:
            writer.write(doc)

if __name__ == "__main__":
    import os
    from dotenv import load_dotenv
    load_dotenv()

    EPUBS_DIR = os.environ["EPUBS_DIR"]

    docs = load_epubs(EPUBS_DIR)
    chunks = split_docs(docs)
    embedded = [embed(chunk.page_content) for chunk in chunks]

    save_output(embedded)

