from dotenv import load_dotenv

load_dotenv()

from operator import itemgetter

from chains.question_generator import chain as question_generator
from jsonlines import open as jsonl_open
from langchain_core.runnables import RunnablePassthrough, RunnablePick
from tqdm import tqdm

if __name__ == "__main__":
    from rich.pretty import pprint

    question_generator = (
        {"context": (lambda doc: doc['page_content']), "num": (lambda _: 5), "doc": (RunnablePassthrough())}
        | RunnablePassthrough.assign(questions=question_generator)
        | RunnablePick(['doc', 'questions'])
    )

    docs = list()
    with jsonl_open('data/pipeline_01.jsonl', 'r') as reader:
        docs = list(reader)

    # filter out docs that have following ['metadata']
    #           "point_no": "32",
    #           "chapter_no": "1",
    #           "article_no": "4",
    #           "paragraph_no": "",
    #           "kind": "Point"
    def is_doc_relevant(doc: dict):
         return doc['metadata']['point_no'] == '32' and doc['metadata']['article_no'] == '4' and doc['metadata']['paragraph_no'] == ''

    docs_to_batch = list(filter(is_doc_relevant, docs))

    with tqdm(total=100, desc="Generating hypothetical questions", unit="document") as pbar:
        with jsonl_open('data/pipeline_02.jsonl', 'w') as writer:
            for _, results in question_generator.batch_as_completed(docs_to_batch):
                writer.write(results)
                pbar.update(1);

