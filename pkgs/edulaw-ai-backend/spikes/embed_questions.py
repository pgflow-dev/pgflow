from app.utils import init_supabase_client
from chains.question_generator import chain as question_generator

if __name__ == "__main__":
    from rich.pretty import pprint

    supabase = init_supabase_client()
    lex_docs = supabase.table('lex_docs')
    # points = lex_docs.select('content, article_no, paragraph_no, point_no').filter('kind', 'eq', 'Point').limit(15).execute()

    # results = supabase.table('documents').select('content, metadata').filter('content', 'eq', ';').execute()
    query = supabase.table('documents').select('content, metadata')
    query = query.filter('metadata->>chapter_no', 'eq', '1')
    query = query.filter('metadata->>article_no', 'eq', '1')
    query = query.filter('metadata->>point_no', 'eq', '3')

    results = query.execute()

    pprint(results)
