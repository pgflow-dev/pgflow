from dotenv import load_dotenv

load_dotenv()

from app.prefixed_embeddings import PrefixedEmbeddings
from jsonlines import open as jsonl_open
from langchain_openai import OpenAIEmbeddings
from tqdm import tqdm

if __name__ == "__main__":
    docs = list()
    with jsonl_open('data/pipeline_02.jsonl', 'r') as reader:
        docs = list(reader)

    docs_to_batch = docs
    embeddings = OpenAIEmbeddings()
    # embeddings = PrefixedEmbeddings()

    with tqdm(total=len(docs_to_batch), desc="Embedding", unit="document") as pbar:
        with jsonl_open('data/pipeline_04.jsonl', 'w') as writer:
            for record in docs_to_batch:
                record['content_embedding'] = embeddings.embed_documents(record['doc']['page_content'])[0]
                record['questions_embeddings'] = embeddings.embed_documents(record['questions'])
                writer.write(record)
                pbar.update(1)
