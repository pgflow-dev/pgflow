import os
from dotenv import load_dotenv
load_dotenv()

from supabase.client import create_client, Client, ClientOptions

def last_5_notes():
    options = ClientOptions(schema='feed')
    client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY'], options)
    # client.auth.set_session(access_token=auth_token, refresh_token='')

    response = client.table('notes').select('*').execute();
    return response

print(last_5_notes())
